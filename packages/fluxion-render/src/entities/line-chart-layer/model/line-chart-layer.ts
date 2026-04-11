import type { Layer } from "../../../shared/model/layer";
import { RingBuffer } from "../../../shared/model/ring-buffer";
import type { Viewport } from "../../../shared/model/viewport";

export interface LineChartConfig {
  color?: string;
  lineWidth?: number;
  /** Ring buffer capacity (number of [t,y] samples retained). Default 2048. */
  capacity?: number;
}

/**
 * Streaming time-series line chart. Expects `Float32Array [t, y, t, y, ...]`
 * where `t` is host-relative milliseconds (monotonic). Each `setData` call
 * appends to an internal ring buffer, so draw cost is O(capacity), not O(total
 * samples pushed).
 *
 * On every append the layer advances `viewport.latestT` so the axis-grid in
 * `xMode: "time"` can compute a trailing sliding window.
 */
export class LineChartLayer implements Layer {
  readonly id: string;
  private color = "#4fc3f7";
  private lineWidth = 1;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(2048, 2);
  }

  setConfig(config: unknown): void {
    const c = config as LineChartConfig;
    if (c.color !== undefined) this.color = c.color;
    if (c.lineWidth !== undefined) this.lineWidth = c.lineWidth;
    if (c.capacity !== undefined && c.capacity !== this.ring.capacity) {
      this.ring = new RingBuffer(c.capacity, 2);
    }
  }

  setData(buffer: ArrayBuffer, length: number, viewport: Viewport): void {
    if (length < 2) return;
    const arr = new Float32Array(buffer, 0, length);
    this.ring.pushMany(arr);
    // The newest timestamp in this batch sits at index (length - 2).
    // Advance the shared latestT so axis-grid time mode can follow.
    const t = arr[length - 2];
    if (t > viewport.latestT) viewport.latestT = t;
  }

  resize(_viewport: Viewport): void {}

  /**
   * Pre-draw pass: compute the visible-window min/max of y values in this
   * layer's ring buffer and merge them into `viewport.observedYMin/Max`.
   * AxisGridLayer with `yMode: "auto"` reads the aggregate in draw.
   *
   * `viewport.bounds.xMin` was already written by AxisGridLayer.scan (which
   * runs earlier in insertion order), so we can filter stale samples here.
   */
  scan(viewport: Viewport): void {
    if (this.ring.length === 0) return;
    const xMin = viewport.bounds.xMin;
    let localMin = viewport.observedYMin;
    let localMax = viewport.observedYMax;
    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const y = data[off + 1];
      if (y < localMin) localMin = y;
      if (y > localMax) localMax = y;
    });
    viewport.observedYMin = localMin;
    viewport.observedYMax = localMax;
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    if (this.ring.length < 2) return;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();

    // Sample filter: skip records older than the current x-window. Combined
    // with axis-grid time mode, this lets consumers "select a window" by
    // changing `timeWindowMs` and have the chart both retarget AND drop
    // old samples from the drawn path in one go.
    const xMin = viewport.bounds.xMin;

    let first = true;
    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const px = viewport.xToPx(t);
      const py = viewport.yToPx(data[off + 1]);
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
  }

  dispose(): void {
    this.ring.clear();
  }
}
