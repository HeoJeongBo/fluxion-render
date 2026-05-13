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
}

export class AreaChartLayer implements Layer {
  readonly id: string;
  private color = "#4fc3f7";
  private fillOpacity = 0.2;
  private lineWidth = 1;
  private visible = true;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(2048, 2);
  }

  setConfig(config: unknown): void {
    const c = config as AreaChartConfig;
    if (c.color !== undefined) this.color = c.color;
    if (c.fillOpacity !== undefined) this.fillOpacity = Math.max(0, Math.min(1, c.fillOpacity));
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

    // Build the line path, collecting first/last visible px for the fill close.
    ctx.beginPath();
    let firstPx = 0;
    let lastPx = 0;
    let first = true;

    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const px = viewport.xToPx(t);
      const py = viewport.yToPx(data[off + 1]);
      if (first) {
        ctx.moveTo(px, py);
        firstPx = px;
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
      lastPx = px;
    });

    if (first) return; // no visible points

    // Close path along baseline for fill.
    ctx.lineTo(lastPx, baselinePy);
    ctx.lineTo(firstPx, baselinePy);
    ctx.closePath();

    // Fill (semi-transparent).
    ctx.fillStyle = hexToRgba(this.color, this.fillOpacity);
    ctx.fill();

    // Re-draw the line on top (without the baseline segments).
    ctx.beginPath();
    first = true;
    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const px = viewport.xToPx(t);
      const py = viewport.yToPx(data[off + 1]);
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.stroke();
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
