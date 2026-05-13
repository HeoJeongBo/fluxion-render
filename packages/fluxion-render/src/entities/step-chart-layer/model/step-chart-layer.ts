import type { Layer } from "../../../shared/model/layer";
import { RingBuffer } from "../../../shared/model/ring-buffer";
import type { Viewport } from "../../../shared/model/viewport";

export interface StepChartConfig {
  color?: string;
  lineWidth?: number;
  capacity?: number;
  retentionMs?: number;
  maxHz?: number;
  visible?: boolean;
}

/**
 * Streaming step (staircase) line chart. Same wire format as LineChartLayer
 * `[t, y, t, y, ...]` but draws horizontal-then-vertical segments so each
 * value holds until the next sample arrives — useful for discrete state
 * changes, digital signals, or ROS2 event topics.
 */
export class StepChartLayer implements Layer {
  readonly id: string;
  private color = "#4fc3f7";
  private lineWidth = 1;
  private visible = true;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(2048, 2);
  }

  setConfig(config: unknown): void {
    const c = config as StepChartConfig;
    if (c.color !== undefined) this.color = c.color;
    if (c.lineWidth !== undefined) this.lineWidth = c.lineWidth;
    if (c.visible !== undefined) this.visible = c.visible;
    let cap = c.capacity;
    if (cap === undefined && c.retentionMs !== undefined && c.maxHz !== undefined) {
      cap = Math.ceil((c.retentionMs / 1000) * c.maxHz * 1.1);
    }
    if (cap !== undefined && cap !== this.ring.capacity) {
      this.ring = new RingBuffer(cap, 2);
    }
  }

  setData(buffer: ArrayBuffer, length: number, viewport: Viewport): void {
    if (length < 2) return;
    const arr = new Float32Array(buffer, 0, length);
    this.ring.pushMany(arr);
    const t = arr[length - 2];
    if (t > viewport.latestT) viewport.latestT = t;
  }

  resize(_viewport: Viewport): void {}

  scan(viewport: Viewport): void {
    if (!this.visible || this.ring.length === 0) return;
    const xMin = viewport.bounds.xMin;
    let localMin = viewport.observedYMin;
    let localMax = viewport.observedYMax;
    this.ring.forEach((data, off) => {
      if (data[off] < xMin) return;
      const y = data[off + 1];
      if (y < localMin) localMin = y;
      if (y > localMax) localMax = y;
    });
    viewport.observedYMin = localMin;
    viewport.observedYMax = localMax;
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.visible || this.ring.length < 2) return;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();

    const xMin = viewport.bounds.xMin;
    let prevPx = 0;
    let prevPy = 0;
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
        // Horizontal segment at previous y, then vertical to new y.
        ctx.lineTo(px, prevPy);
        ctx.lineTo(px, py);
      }
      prevPx = px;
      prevPy = py;
    });

    // Suppress unused warning.
    void prevPx;

    ctx.stroke();
  }

  dispose(): void {
    this.ring.clear();
  }
}
