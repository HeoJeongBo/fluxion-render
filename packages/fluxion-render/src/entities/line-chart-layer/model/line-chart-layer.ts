import type { Layer } from "../../../shared/model/layer";
import { RingBuffer } from "../../../shared/model/ring-buffer";
import type { Viewport } from "../../../shared/model/viewport";

export interface LineChartConfig {
  color?: string;
  lineWidth?: number;
  /** Ring buffer capacity (number of [t,y] samples retained). Default 2048. */
  capacity?: number;
  /** Data retention window in ms. Combined with maxHz to auto-calculate capacity. */
  retentionMs?: number;
  /** Expected max sample rate in Hz. Combined with retentionMs to auto-calculate capacity. */
  maxHz?: number;
  /** When false, skip draw and scan. Default true. */
  visible?: boolean;
  /**
   * When true, the DRAW path is min/max-decimated to ~2 points per x-pixel
   * column when there are more visible samples than pixels. This keeps the
   * rendered line visually identical (every peak/trough at display resolution
   * is preserved) while cutting `lineTo` calls from O(samples) to O(width) —
   * essential for high-rate (e.g. 500 Hz) streams. The ring still holds EVERY
   * sample, so hover/scan/export are unaffected. Default false.
   */
  decimate?: boolean;
}

/**
 * Streaming time-series line chart. Expects `Float32Array [t, y, t, y, ...]`
 * where `t` is host-relative milliseconds (monotonic). Each `setData` call
 * appends to an internal ring buffer, so draw cost is O(capacity), not O(total
 * samples pushed).
 *
 * On every append the layer advances `viewport.latestT` so the axis-grid in
 * `xMode: "time"` can compute a trailing sliding window.
 *
 * **Float32 timestamp range**: `t` is stored as Float32 in the wire format,
 * so absolute ms-since-epoch (~1.78e12) quantises to ~131,072 ms buckets and
 * collapses sub-second samples onto a single x coordinate. Always push
 * host-relative `t` (e.g. `Date.now() - timeOrigin`, where `timeOrigin` is the
 * session start) and let `axisGridLayer({ timeOrigin })` reconstruct wall-clock
 * labels at draw time.
 */
export class LineChartLayer implements Layer {
  readonly id: string;
  private color = "#4fc3f7";
  private lineWidth = 1;
  private visible = true;
  private decimate = false;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(2048, 2);
  }

  setConfig(config: unknown): void {
    const c = config as LineChartConfig;
    if (c.color !== undefined) this.color = c.color;
    if (c.lineWidth !== undefined) this.lineWidth = c.lineWidth;
    if (c.visible !== undefined) this.visible = c.visible;
    if (c.decimate !== undefined) this.decimate = c.decimate;
    let newCapacity: number | undefined = c.capacity;
    if (newCapacity === undefined && c.retentionMs !== undefined && c.maxHz !== undefined) {
      newCapacity = Math.ceil((c.retentionMs / 1000) * c.maxHz * 1.1);
    }
    if (newCapacity !== undefined && newCapacity !== this.ring.capacity) {
      this.ring = new RingBuffer(newCapacity, 2);
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
    if (!this.visible || this.ring.length === 0) return;
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
    if (!this.visible || this.ring.length < 2) return;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.beginPath();

    // Sample filter: skip records older than the current x-window. Combined
    // with axis-grid time mode, this lets consumers "select a window" by
    // changing `timeWindowMs` and have the chart both retarget AND drop
    // old samples from the drawn path in one go.
    const xMin = viewport.bounds.xMin;

    // Decimate the DRAW (not the data) when there are far more visible samples
    // than pixels — emit min/max per x-pixel column so the rendered shape is
    // identical but the path is O(width) instead of O(samples).
    if (this.decimate && this.ring.length > viewport.widthPx * 2) {
      this._drawDecimated(ctx, viewport, xMin);
      ctx.stroke();
      return;
    }

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

  /**
   * Min/max-per-pixel-column path. For each integer x-pixel that has samples,
   * draw to the column's first, min-y, max-y and last sample (in time order
   * within the column) — preserving every visible peak/trough at display
   * resolution while bounding the path to ~2–4 points per pixel.
   */
  private _drawDecimated(
    ctx: OffscreenCanvasRenderingContext2D,
    viewport: Viewport,
    xMin: number,
  ): void {
    let first = true;
    let curCol = Number.NaN;
    // Per-column accumulators (y in data space; converted to px on flush).
    let firstY = 0;
    let lastY = 0;
    let minY = 0;
    let maxY = 0;

    const flush = (colPx: number): void => {
      // Emit first → min → max → last (skipping duplicates) so the column's
      // vertical extent is drawn without redundant points.
      const pts = [firstY, minY, maxY, lastY];
      for (let k = 0; k < pts.length; k++) {
        if (k > 0 && pts[k] === pts[k - 1]) continue;
        const py = viewport.yToPx(pts[k]);
        if (first) {
          ctx.moveTo(colPx, py);
          first = false;
        } else {
          ctx.lineTo(colPx, py);
        }
      }
    };

    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const y = data[off + 1];
      const col = Math.floor(viewport.xToPx(t));
      if (col !== curCol) {
        if (!Number.isNaN(curCol)) flush(curCol);
        curCol = col;
        firstY = y;
        minY = y;
        maxY = y;
      } else {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      lastY = y;
    });
    if (!Number.isNaN(curCol)) flush(curCol);
  }

  clearData(): void {
    this.ring.clear();
  }

  dispose(): void {
    this.ring.clear();
  }
}
