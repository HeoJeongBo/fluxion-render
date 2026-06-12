import type { Layer } from "../../../shared/model/layer";
import { RingBuffer } from "../../../shared/model/ring-buffer";
import type { Viewport } from "../../../shared/model/viewport";

export interface AreaChartConfig {
  color?: string;
  /** Fill opacity [0,1]. Default 0.2. */
  fillOpacity?: number;
  lineWidth?: number;
  capacity?: number;
  retentionMs?: number;
  maxHz?: number;
  visible?: boolean;
  /**
   * Maximum allowed time gap (ms) between consecutive samples before the
   * area is broken: the current fill polygon closes to the baseline and a
   * new one starts after the gap (the stroke breaks too). Undefined
   * (default) keeps the current behavior: one continuous area.
   */
  maxGapMs?: number;
}

export class AreaChartLayer implements Layer {
  readonly id: string;
  private color = "#4fc3f7";
  private fillOpacity = 0.2;
  private lineWidth = 1;
  private visible = true;
  private maxGapMs: number | undefined;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(2048, 2);
  }

  setConfig(config: unknown): void {
    const c = config as AreaChartConfig;
    if (c.color !== undefined) this.color = c.color;
    if (c.fillOpacity !== undefined)
      this.fillOpacity = Math.max(0, Math.min(1, c.fillOpacity));
    if (c.lineWidth !== undefined) this.lineWidth = c.lineWidth;
    if (c.visible !== undefined) this.visible = c.visible;
    if (c.maxGapMs !== undefined) this.maxGapMs = c.maxGapMs;
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

    const xMin = viewport.bounds.xMin;
    const baselinePy = viewport.yToPx(0);
    const gap = this.maxGapMs;

    // Pass 1 — fill: one closed-to-baseline polygon per gap-separated
    // segment. With maxGapMs unset there is exactly one segment, producing
    // the same call sequence as before.
    ctx.beginPath();
    let segFirstPx = 0;
    let prevPx = 0;
    let prevT = 0;
    let inSeg = false;
    let any = false;
    const closeSeg = (): void => {
      ctx.lineTo(prevPx, baselinePy);
      ctx.lineTo(segFirstPx, baselinePy);
      ctx.closePath();
    };
    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const px = viewport.xToPx(t);
      const py = viewport.yToPx(data[off + 1]);
      if (inSeg && gap !== undefined && t - prevT > gap) {
        closeSeg();
        inSeg = false;
      }
      if (!inSeg) {
        ctx.moveTo(px, py);
        segFirstPx = px;
        inSeg = true;
        any = true;
      } else {
        ctx.lineTo(px, py);
      }
      prevPx = px;
      prevT = t;
    });

    if (!any) return; // no visible points

    closeSeg();
    ctx.fillStyle = hexToRgba(this.color, this.fillOpacity);
    ctx.fill();

    // Pass 2 — stroke on top, breaking at gaps (no baseline segments).
    ctx.beginPath();
    let first = true;
    prevT = 0;
    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const px = viewport.xToPx(t);
      const py = viewport.yToPx(data[off + 1]);
      if (first || (gap !== undefined && t - prevT > gap)) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
      prevT = t;
    });
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.stroke();
  }

  clearData(): void {
    this.ring.clear();
  }

  dispose(): void {
    this.ring.clear();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
