import type { Layer } from "../../../shared/model/layer";
import { RingBuffer } from "../../../shared/model/ring-buffer";
import type { Viewport } from "../../../shared/model/viewport";

export interface CandlestickConfig {
  /** Candle color when close >= open. Default "#26a69a". */
  upColor?: string;
  /** Candle color when close < open. Default "#ef5350". */
  downColor?: string;
  /** Body width in CSS pixels. Default 6. */
  bodyWidth?: number;
  capacity?: number;
  retentionMs?: number;
  maxHz?: number;
  visible?: boolean;
}

/**
 * Streaming OHLC candlestick chart.
 * Data layout: `Float32Array [t, open, high, low, close, t, open, ...]` stride=5.
 * Useful for financial data, sensor min/max/mean aggregation, or any
 * dataset where you want to show the range and direction of values over time.
 */
export class CandlestickLayer implements Layer {
  readonly id: string;
  private upColor = "#26a69a";
  private downColor = "#ef5350";
  private bodyWidth = 6;
  private visible = true;
  private ring: RingBuffer;

  constructor(id: string) {
    this.id = id;
    this.ring = new RingBuffer(512, 5);
  }

  setConfig(config: unknown): void {
    const c = config as CandlestickConfig;
    if (c.upColor !== undefined) this.upColor = c.upColor;
    if (c.downColor !== undefined) this.downColor = c.downColor;
    if (c.bodyWidth !== undefined) this.bodyWidth = Math.max(2, c.bodyWidth);
    if (c.visible !== undefined) this.visible = c.visible;
    let cap = c.capacity;
    if (cap === undefined && c.retentionMs !== undefined && c.maxHz !== undefined) {
      cap = Math.ceil((c.retentionMs / 1000) * c.maxHz * 1.1);
    }
    if (cap !== undefined && cap !== this.ring.capacity) {
      this.ring = new RingBuffer(cap, 5);
    }
  }

  setData(buffer: ArrayBuffer, length: number, viewport: Viewport): void {
    if (length < 5) return;
    const arr = new Float32Array(buffer, 0, length);
    this.ring.pushMany(arr);
    // t is at index 0 of each stride-5 record; last record starts at length-5.
    const t = arr[length - 5];
    if (t > viewport.latestT) viewport.latestT = t;
  }

  resize(_viewport: Viewport): void {}

  scan(viewport: Viewport): void {
    if (!this.visible || this.ring.length === 0) return;
    const xMin = viewport.bounds.xMin;
    let localMin = viewport.observedYMin;
    let localMax = viewport.observedYMax;
    // stride=5: [t, open, high, low, close]
    this.ring.forEach((data, off) => {
      if (data[off] < xMin) return;
      const high = data[off + 2];
      const low = data[off + 3];
      if (low < localMin) localMin = low;
      if (high > localMax) localMax = high;
    });
    viewport.observedYMin = localMin;
    viewport.observedYMax = localMax;
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.visible || this.ring.length === 0) return;

    const bw = this.bodyWidth;
    const half = bw / 2;
    const xMin = viewport.bounds.xMin;

    this.ring.forEach((data, off) => {
      const t = data[off];
      if (t < xMin) return;
      const open = data[off + 1];
      const high = data[off + 2];
      const low = data[off + 3];
      const close = data[off + 4];

      const px = viewport.xToPx(t);
      const openPy = viewport.yToPx(open);
      const highPy = viewport.yToPx(high);
      const lowPy = viewport.yToPx(low);
      const closePy = viewport.yToPx(close);

      ctx.fillStyle = close >= open ? this.upColor : this.downColor;

      // Wick (thin vertical line through high-low).
      ctx.fillRect(px - 0.5, highPy, 1, lowPy - highPy);

      // Body (open-close rectangle).
      const bodyTop = Math.min(openPy, closePy);
      const bodyH = Math.max(1, Math.abs(closePy - openPy));
      ctx.fillRect(px - half, bodyTop, bw, bodyH);
    });
  }

  dispose(): void {
    this.ring.clear();
  }
}
