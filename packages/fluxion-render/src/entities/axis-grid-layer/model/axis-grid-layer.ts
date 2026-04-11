import { niceTicks } from "../../../shared/lib/math";
import { formatClock } from "../../../shared/lib/time-format";
import type { Layer } from "../../../shared/model/layer";
import type { Bounds, Viewport } from "../../../shared/model/viewport";

export interface AxisGridConfig {
  /** Fixed x-range. Used when `xMode` is "fixed" (default). */
  xRange?: [number, number];
  yRange?: [number, number];
  gridColor?: string;
  axisColor?: string;
  labelColor?: string;
  font?: string;
  targetTicks?: number;
  /** If true (default), writes this layer's bounds into `viewport` so data layers share them. */
  applyToViewport?: boolean;
  /**
   * "fixed": xRange is literal world units (default).
   * "time": bounds follow the streaming `viewport.latestT` as a trailing
   * sliding window `[latestT - timeWindowMs, latestT]`. yRange is still fixed.
   */
  xMode?: "fixed" | "time";
  /** Width of the sliding window in ms when xMode="time". Default 5000. */
  timeWindowMs?: number;
  /**
   * Absolute wall-clock epoch (ms) corresponding to data timestamp `0`. When
   * set together with `xMode: "time"`, tick labels render as wall clock
   * instead of elapsed seconds. Typically set once at host creation:
   * `timeOrigin: Date.now()` on the main thread.
   */
  timeOrigin?: number;
  /**
   * Clock-pattern string used to render x tick labels when `xMode: "time"`
   * AND `timeOrigin` is set. Default `"HH:mm:ss"`. Supported tokens:
   * `HH / H / mm / m / ss / s / SSS / S`. Anything else is a literal.
   *
   * Ignored when `timeOrigin` is not provided — elapsed-seconds fallback
   * (`"X.Xs"`) is used instead.
   */
  xTickFormat?: string;
}

export class AxisGridLayer implements Layer {
  readonly id: string;
  private gridColor = "rgba(255,255,255,0.08)";
  private axisColor = "rgba(255,255,255,0.4)";
  private labelColor = "rgba(255,255,255,0.7)";
  private font = "10px sans-serif";
  private targetTicks = 6;
  private bounds: Bounds = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  private applyToViewport = true;
  private xMode: "fixed" | "time" = "fixed";
  private timeWindowMs = 5000;
  private timeOrigin: number | null = null;
  private xTickFormat = "HH:mm:ss";

  constructor(id: string) {
    this.id = id;
  }

  setConfig(config: unknown): void {
    const c = config as AxisGridConfig;
    if (c.xRange) {
      this.bounds.xMin = c.xRange[0];
      this.bounds.xMax = c.xRange[1];
    }
    if (c.yRange) {
      this.bounds.yMin = c.yRange[0];
      this.bounds.yMax = c.yRange[1];
    }
    if (c.gridColor) this.gridColor = c.gridColor;
    if (c.axisColor) this.axisColor = c.axisColor;
    if (c.labelColor) this.labelColor = c.labelColor;
    if (c.font) this.font = c.font;
    if (c.targetTicks) this.targetTicks = c.targetTicks;
    if (c.applyToViewport !== undefined) this.applyToViewport = c.applyToViewport;
    if (c.xMode !== undefined) this.xMode = c.xMode;
    if (c.timeWindowMs !== undefined) this.timeWindowMs = c.timeWindowMs;
    if (c.timeOrigin !== undefined) this.timeOrigin = c.timeOrigin;
    if (c.xTickFormat !== undefined) this.xTickFormat = c.xTickFormat;
  }

  setData(_buffer: ArrayBuffer, _length: number, _viewport: Viewport): void {}

  resize(_viewport: Viewport): void {}

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    // Axis layer owns world bounds; apply them before any data layer reads
    // viewport.bounds. LayerStack draws in insertion order, so as long as
    // the axis layer is added first, data layers will see up-to-date bounds.
    if (this.xMode === "time") {
      const latestT = viewport.latestT;
      this.bounds.xMin = latestT - this.timeWindowMs;
      this.bounds.xMax = latestT;
    }
    if (this.applyToViewport) {
      viewport.setBounds(this.bounds);
    }
    const { widthPx: w, heightPx: h } = viewport;

    const xTicks = niceTicks(this.bounds.xMin, this.bounds.xMax, this.targetTicks);
    const yTicks = niceTicks(this.bounds.yMin, this.bounds.yMax, this.targetTicks);

    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < xTicks.length; i++) {
      const x = Math.round(viewport.xToPx(xTicks[i])) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let i = 0; i < yTicks.length; i++) {
      const y = Math.round(viewport.yToPx(yTicks[i])) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.strokeStyle = this.axisColor;
    ctx.beginPath();
    if (this.bounds.xMin < 0 && this.bounds.xMax > 0) {
      const x0 = Math.round(viewport.xToPx(0)) + 0.5;
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, h);
    }
    if (this.bounds.yMin < 0 && this.bounds.yMax > 0) {
      const y0 = Math.round(viewport.yToPx(0)) + 0.5;
      ctx.moveTo(0, y0);
      ctx.lineTo(w, y0);
    }
    ctx.stroke();

    ctx.fillStyle = this.labelColor;
    ctx.font = this.font;
    ctx.textBaseline = "top";
    for (let i = 0; i < xTicks.length; i++) {
      const x = viewport.xToPx(xTicks[i]);
      ctx.fillText(
        formatTick(xTicks[i], this.xMode, this.timeOrigin, this.xTickFormat),
        x + 2,
        h - 12,
      );
    }
    ctx.textBaseline = "middle";
    for (let i = 0; i < yTicks.length; i++) {
      const y = viewport.yToPx(yTicks[i]);
      ctx.fillText(String(yTicks[i]), 2, y - 6);
    }
  }

  dispose(): void {}
}

function formatTick(
  value: number,
  mode: "fixed" | "time",
  timeOrigin: number | null,
  pattern: string,
): string {
  if (mode === "time") {
    if (timeOrigin != null) {
      return formatClock(timeOrigin + value, pattern);
    }
    // Elapsed-only fallback (timeOrigin missing).
    const s = value / 1000;
    return `${s.toFixed(1)}s`;
  }
  return String(value);
}
