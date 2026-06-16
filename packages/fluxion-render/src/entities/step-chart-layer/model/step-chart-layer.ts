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
  /**
   * Maximum allowed time gap (ms) between consecutive samples before the
   * staircase is broken: the bridging horizontal+vertical segments are
   * skipped and a new subpath starts after the gap. Undefined (default)
   * keeps the current behavior: each value holds until the next sample.
   */
  maxGapMs?: number;
  /**
   * Canvas `setLineDash` pattern for the stroke, in CSS px. Default `[]`
   * (solid). Use it to tell apart series whose values overlap. Visual only:
   * data, hover, and auto-scaling are unaffected.
   */
  dashArray?: number[];
  /**
   * Vertical offset added to every y at DRAW time, in DATA units. Default 0.
   * Shifts the staircase up/down to separate overlapping series. `scan()`
   * widens the observed y-range so `yMode: "auto"` fits it. Visual only:
   * hover, export, and the underlying samples are unaffected. Ignored in lane
   * mode (see `laneCount`).
   */
  yOffset?: number;
  /**
   * Lane (small-multiples) mode. When `laneCount >= 1`, the staircase is drawn
   * into band `laneIndex` of `laneCount`, auto-normalized to its OWN visible
   * y-range. The shared y-axis no longer applies and `yOffset` is ignored.
   * Default off. See `LineChartConfig`.
   */
  laneIndex?: number;
  /** Total number of lanes. See {@link laneIndex}. Default 0 (off). */
  laneCount?: number;
  /** Gap between adjacent lanes, in CSS px. Default 6. */
  laneGapPx?: number;
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
  private maxGapMs: number | undefined;
  private dashArray: number[] = [];
  private yOffset = 0;
  private laneIndex = 0;
  private laneCount = 0;
  private laneGapPx = 6;
  private scannedYMin = Number.NaN;
  private scannedYMax = Number.NaN;
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
    if (c.maxGapMs !== undefined) this.maxGapMs = c.maxGapMs;
    if (c.dashArray !== undefined) this.dashArray = c.dashArray;
    if (c.yOffset !== undefined) this.yOffset = c.yOffset;
    if (c.laneIndex !== undefined) this.laneIndex = c.laneIndex;
    if (c.laneCount !== undefined) this.laneCount = c.laneCount;
    if (c.laneGapPx !== undefined) this.laneGapPx = c.laneGapPx;
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
    const lane = this.laneActive();
    const off0 = lane ? 0 : this.yOffset; // lanes normalize per-layer
    let localMin = lane ? Number.POSITIVE_INFINITY : viewport.observedYMin;
    let localMax = lane ? Number.NEGATIVE_INFINITY : viewport.observedYMax;
    this.ring.forEach((data, off) => {
      if (data[off] < xMin) return;
      const y = data[off + 1] + off0;
      if (y < localMin) localMin = y;
      if (y > localMax) localMax = y;
    });
    if (lane) {
      this.scannedYMin = localMin;
      this.scannedYMax = localMax;
    } else {
      viewport.observedYMin = localMin;
      viewport.observedYMax = localMax;
    }
  }

  private laneActive(): boolean {
    return this.laneCount > 0;
  }

  /** Map a data `y` into this layer's lane band (own scanned range). */
  private yToBandPx(y: number, viewport: Viewport): number {
    const pad = viewport.yPadPx;
    const usable = viewport.heightPx - pad * 2;
    const bandH = usable / this.laneCount;
    const gap = this.laneGapPx;
    const top = pad + this.laneIndex * bandH + gap / 2;
    const bottom = pad + (this.laneIndex + 1) * bandH - gap / 2;
    let lo = this.scannedYMin;
    let hi = this.scannedYMax;
    if (!(hi > lo)) {
      lo -= 0.5;
      hi += 0.5;
    }
    const frac = (y - lo) / (hi - lo);
    return bottom - frac * (bottom - top);
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.visible || this.ring.length < 2) return;
    const lane = this.laneActive();
    if (lane && !Number.isFinite(this.scannedYMin)) return;

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    const dashed = this.dashArray.length > 0;
    if (dashed) ctx.setLineDash(this.dashArray);
    ctx.beginPath();

    const xMin = viewport.bounds.xMin;
    const gap = this.maxGapMs;
    let prevPy = 0;
    let prevT = 0;
    let first = true;

    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const px = viewport.xToPx(t);
      const py = lane
        ? this.yToBandPx(data[off + 1], viewport)
        : viewport.yToPx(data[off + 1] + this.yOffset);
      // Break the staircase across a time gap: skip the bridging H+V
      // segments and start a new subpath at the post-gap sample.
      if (first || (gap !== undefined && t - prevT > gap)) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        // Horizontal segment at previous y, then vertical to new y.
        ctx.lineTo(px, prevPy);
        ctx.lineTo(px, py);
      }
      prevPy = py;
      prevT = t;
    });

    ctx.stroke();
    if (dashed) ctx.setLineDash([]);
  }

  clearData(): void {
    this.ring.clear();
  }

  dispose(): void {
    this.ring.clear();
  }
}
