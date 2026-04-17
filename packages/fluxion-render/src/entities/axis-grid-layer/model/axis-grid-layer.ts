import { formatTick } from "../../../shared/lib/axis-ticks";
import { niceTicks } from "../../../shared/lib/math";
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

  // ─── y scaling ────────────────────────────────────────────
  /**
   * "fixed" (default): use configured `yRange`.
   * "auto": data-driven. Reads `viewport.observedYMin/Max` during draw,
   * applies padding and clamps, updates `bounds.yMin/yMax`. Requires at
   * least one data layer (e.g. `LineChartLayer`) in the stack to publish
   * observations via its `scan()` pass.
   */
  yMode?: "fixed" | "auto";
  /** Padding ratio applied above/below the observed range. Default 0.1 (10%). */
  yAutoPadding?: number;
  /** Absolute lower clamp after padding. */
  yAutoMin?: number;
  /** Absolute upper clamp after padding. */
  yAutoMax?: number;

  // ─── Visual toggles (all default true) ────────────────────
  /** Show vertical grid lines at x ticks. */
  showXGrid?: boolean;
  /** Show horizontal grid lines at y ticks. */
  showYGrid?: boolean;
  /** Show the x=0 / y=0 axis lines when 0 is inside the range. */
  showAxes?: boolean;
  /** Show tick labels along the x axis. */
  showXLabels?: boolean;
  /** Show tick labels along the y axis. */
  showYLabels?: boolean;
  /**
   * Canvas setLineDash pattern for grid lines. Default [] (solid).
   * Example: [3, 3] produces the dashed style used by recharts.
   */
  gridDashArray?: number[];
}

/**
 * Owns the viewport bounds orchestration for a chart: x window (fixed or
 * time-sliding), y range (fixed or data-driven auto), and renders the
 * visible grid/axes/labels on top.
 *
 * Orchestration (scan + bounds computation) runs independently of the
 * visual toggles — you can turn every `show*` off and still use this layer
 * purely as a controller. LayerStack insertion order matters: add this
 * before any data layer so the bounds are written before they're read.
 *
 * v0.3 limitation: single-axis only. `observedYMin/Max` live on `Viewport`,
 * so a second `AxisGridLayer` in the same stack would bleed observations.
 */
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
  private yMode: "fixed" | "auto" = "fixed";
  private yAutoPadding = 0.1;
  private yAutoMin: number | undefined;
  private yAutoMax: number | undefined;
  private showXGrid = true;
  private showYGrid = true;
  private showAxes = true;
  private showXLabels = true;
  private showYLabels = true;
  private gridDashArray: number[] = [];

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
    if (c.yMode !== undefined) this.yMode = c.yMode;
    if (c.yAutoPadding !== undefined) this.yAutoPadding = c.yAutoPadding;
    if (c.yAutoMin !== undefined) this.yAutoMin = c.yAutoMin;
    if (c.yAutoMax !== undefined) this.yAutoMax = c.yAutoMax;
    if (c.showXGrid !== undefined) this.showXGrid = c.showXGrid;
    if (c.showYGrid !== undefined) this.showYGrid = c.showYGrid;
    if (c.showAxes !== undefined) this.showAxes = c.showAxes;
    if (c.showXLabels !== undefined) this.showXLabels = c.showXLabels;
    if (c.showYLabels !== undefined) this.showYLabels = c.showYLabels;
    if (c.gridDashArray !== undefined) this.gridDashArray = c.gridDashArray;
  }

  setData(_buffer: ArrayBuffer, _length: number, _viewport: Viewport): void {}

  resize(_viewport: Viewport): void {}

  /**
   * Orchestration pass: establish x bounds so data layers' `scan` can filter
   * visible samples correctly. yMode:"auto" is finalized in `draw` after all
   * line layers have published their observations.
   */
  scan(viewport: Viewport): void {
    if (this.xMode === "time") {
      const latestT = viewport.latestT;
      this.bounds.xMin = latestT - this.timeWindowMs;
      this.bounds.xMax = latestT;
    }
    if (this.applyToViewport) {
      viewport.setBounds(this.bounds);
    }
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    // Finalize y-auto bounds. Runs after all line-layer scans have
    // published their observed extents into the viewport.
    if (this.yMode === "auto") {
      let yMin = viewport.observedYMin;
      let yMax = viewport.observedYMax;
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
        // No data yet — fall back to configured yRange. If that is also
        // degenerate (defaults [-1, 1] from construction), use [-1, 1].
        yMin = this.bounds.yMin;
        yMax = this.bounds.yMax;
        if (yMin === yMax) {
          yMin = -1;
          yMax = 1;
        }
      } else if (yMin === yMax) {
        // Flat line — expand so stroke has vertical room.
        yMin -= 0.5;
        yMax += 0.5;
      } else {
        const pad = (yMax - yMin) * this.yAutoPadding;
        yMin -= pad;
        yMax += pad;
      }
      if (this.yAutoMin !== undefined && yMin < this.yAutoMin) yMin = this.yAutoMin;
      if (this.yAutoMax !== undefined && yMax > this.yAutoMax) yMax = this.yAutoMax;
      this.bounds.yMin = yMin;
      this.bounds.yMax = yMax;
      if (this.applyToViewport) viewport.setBounds(this.bounds);
    }

    const { widthPx: w, heightPx: h } = viewport;
    const xTicks = niceTicks(this.bounds.xMin, this.bounds.xMax, this.targetTicks);
    const yTicks = niceTicks(this.bounds.yMin, this.bounds.yMax, this.targetTicks);

    // ── Grid lines ──
    if (this.showXGrid || this.showYGrid) {
      ctx.strokeStyle = this.gridColor;
      ctx.lineWidth = 1;
      if (this.gridDashArray.length > 0) ctx.setLineDash(this.gridDashArray);
      ctx.beginPath();
      if (this.showXGrid) {
        for (let i = 0; i < xTicks.length; i++) {
          const x = Math.round(viewport.xToPx(xTicks[i])) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
      }
      if (this.showYGrid) {
        for (let i = 0; i < yTicks.length; i++) {
          const y = Math.round(viewport.yToPx(yTicks[i])) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
      }
      ctx.stroke();
      if (this.gridDashArray.length > 0) ctx.setLineDash([]);
    }

    // ── Zero axes ──
    if (this.showAxes) {
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
    }

    // ── Labels ──
    if (this.showXLabels || this.showYLabels) {
      ctx.fillStyle = this.labelColor;
      ctx.font = this.font;
      if (this.showXLabels) {
        ctx.textBaseline = "top";
        for (let i = 0; i < xTicks.length; i++) {
          const x = viewport.xToPx(xTicks[i]);
          ctx.fillText(
            formatTick(xTicks[i], this.xMode, this.timeOrigin, this.xTickFormat),
            x + 2,
            h - 12,
          );
        }
      }
      if (this.showYLabels) {
        ctx.textBaseline = "middle";
        for (let i = 0; i < yTicks.length; i++) {
          const y = viewport.yToPx(yTicks[i]);
          ctx.fillText(String(yTicks[i]), 2, y - 6);
        }
      }
    }
  }

  dispose(): void {}
}
