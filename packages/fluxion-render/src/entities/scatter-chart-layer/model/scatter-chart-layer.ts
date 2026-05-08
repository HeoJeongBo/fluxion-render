import type { Layer } from "../../../shared/model/layer";
import { RingBuffer } from "../../../shared/model/ring-buffer";
import type { Viewport } from "../../../shared/model/viewport";

export interface ScatterChartConfig {
  /** Point color. Default "#4fc3f7". */
  color?: string;
  /** Point size in pixels. Default 3. */
  pointSize?: number;
  /** Point shape. Default "square". */
  shape?: "square" | "circle";
  /** Ring buffer capacity (number of [t,y] samples retained). Default 2048. */
  capacity?: number;
  /** Data retention window in ms. Combined with maxHz to auto-calculate capacity. */
  retentionMs?: number;
  /** Expected max sample rate in Hz. Combined with retentionMs to auto-calculate capacity. */
  maxHz?: number;
  /** When false, skip draw and scan. Default true. */
  visible?: boolean;
}

/**
 * Streaming time-series scatter plot. Same data layout as `LineChartLayer`
 * — Float32Array `[t, y, t, y, ...]` where `t` is host-relative ms — but
 * renders each sample as an individual point instead of a connected line.
 *
 * Use this when the relationship between consecutive samples is not meaningful
 * (noisy sensors, discrete events, outlier detection) and you want to see the
 * raw distribution rather than an interpolated trend.
 */
export class ScatterChartLayer implements Layer {
  readonly id: string;
  private color = "#4fc3f7";
  private pointSize = 3;
  private shape: "square" | "circle" = "square";
  private visible = true;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(2048, 2);
  }

  setConfig(config: unknown): void {
    const c = config as ScatterChartConfig;
    if (c.color !== undefined) this.color = c.color;
    if (c.pointSize !== undefined) this.pointSize = Math.max(1, c.pointSize);
    if (c.shape !== undefined) this.shape = c.shape;
    if (c.visible !== undefined) this.visible = c.visible;
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

    const size = this.pointSize;
    const half = size / 2;
    const xMin = viewport.bounds.xMin;

    ctx.fillStyle = this.color;
    ctx.beginPath();

    if (this.shape === "circle") {
      this.ring.forEach((data, off) => {
        const t = data[off];
        if (t < xMin) return;
        const px = viewport.xToPx(t);
        const py = viewport.yToPx(data[off + 1]);
        ctx.moveTo(px + half, py);
        ctx.arc(px, py, half, 0, Math.PI * 2);
      });
    } else {
      this.ring.forEach((data, off) => {
        const t = data[off];
        if (t < xMin) return;
        const px = viewport.xToPx(t);
        const py = viewport.yToPx(data[off + 1]);
        ctx.rect(px - half, py - half, size, size);
      });
    }

    ctx.fill();
  }

  dispose(): void {
    this.ring.clear();
  }
}
