import { AreaChartLayer } from "../../../entities/area-chart-layer";
import { AxisGridLayer } from "../../../entities/axis-grid-layer";
import { BarChartLayer } from "../../../entities/bar-chart-layer";
import { BoxPlotLayer } from "../../../entities/box-plot-layer";
import { CandlestickLayer } from "../../../entities/candlestick-layer";
import { EventMarkerLayer } from "../../../entities/event-marker-layer";
import { HeatmapLayer } from "../../../entities/heatmap-layer";
import { HeatmapStreamLayer } from "../../../entities/heatmap-stream-layer";
import { HistogramLayer } from "../../../entities/histogram-layer";
import { LayerStack } from "../../../entities/layer-stack";
import { LidarScatterLayer } from "../../../entities/lidar-scatter-layer";
import { LineChartLayer } from "../../../entities/line-chart-layer";
import { LineChartStaticLayer } from "../../../entities/line-chart-static-layer";
import { OccupancyGridLayer } from "../../../entities/occupancy-grid-layer";
import { PoseArrowLayer } from "../../../entities/pose-arrow-layer";
import { ReferenceLineLayer } from "../../../entities/reference-line-layer";
import { ScatterChartLayer } from "../../../entities/scatter-chart-layer";
import { ScatterColoredLayer } from "../../../entities/scatter-colored-layer";
import { StackedAreaLayer } from "../../../entities/stacked-area-layer";
import { StepChartLayer } from "../../../entities/step-chart-layer";
import { TrajectoryLayer } from "../../../entities/trajectory-layer";
import type { Layer } from "../../../shared/model/layer";
import { Scheduler } from "../../../shared/model/scheduler";
import { Viewport } from "../../../shared/model/viewport";
import type {
  AxisStyle,
  HostMsg,
  LayerKind,
  SetAxisCanvasMsg,
  TickUpdateMsg,
} from "../../../shared/protocol";
import { Op, WorkerOp } from "../../../shared/protocol";

function createLayer(id: string, kind: LayerKind): Layer {
  switch (kind) {
    case "line":
      return new LineChartLayer(id);
    case "line-static":
      return new LineChartStaticLayer(id);
    case "lidar":
      return new LidarScatterLayer(id);
    case "axis-grid":
      return new AxisGridLayer(id);
    case "scatter":
      return new ScatterChartLayer(id);
    case "area":
      return new AreaChartLayer(id);
    case "step":
      return new StepChartLayer(id);
    case "bar":
      return new BarChartLayer(id);
    case "candlestick":
      return new CandlestickLayer(id);
    case "heatmap":
      return new HeatmapLayer(id);
    case "event-marker":
      return new EventMarkerLayer(id);
    case "scatter-colored":
      return new ScatterColoredLayer(id);
    case "heatmap-stream":
      return new HeatmapStreamLayer(id);
    case "reference-line":
      return new ReferenceLineLayer(id);
    case "pose-arrow":
      return new PoseArrowLayer(id);
    case "trajectory":
      return new TrajectoryLayer(id);
    case "occupancy-grid":
      return new OccupancyGridLayer(id);
    case "histogram":
      return new HistogramLayer(id);
    case "stacked-area":
      return new StackedAreaLayer(id);
    case "box-plot":
      return new BoxPlotLayer(id);
  }
}

/**
 * Worker-side engine. Owns the OffscreenCanvas, layer stack, viewport,
 * and render scheduler. All state lives here; main thread just pushes messages.
 */
export class Engine {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private xAxisCanvas: OffscreenCanvas | null = null;
  private xAxisCtx: OffscreenCanvasRenderingContext2D | null = null;
  private xAxisHeight = 30;
  private yAxisCanvas: OffscreenCanvas | null = null;
  private yAxisCtx: OffscreenCanvasRenderingContext2D | null = null;
  private yAxisWidth = 60;
  private axisStyle: AxisStyle = {};
  private readonly viewport = new Viewport();
  private readonly stack = new LayerStack();
  private readonly scheduler: Scheduler;
  private bgColor = "#0b0d12";
  // Page visibility, driven by the host's `visibilitychange`. While false, the
  // follow-clock continuous render loop is suspended (CPU/battery), regardless
  // of whether an axis layer is following the clock.
  private visible = true;
  private hostId: string | undefined;
  private lastSentYMin = Number.NaN;
  private lastSentYMax = Number.NaN;
  private lastSentXTickMs = 0;
  // Skip BOUNDS_UPDATE when change is smaller than this fraction of the range.
  // Prevents flooding the main thread for sub-pixel y-range drift.
  private static readonly BOUNDS_EPS = 1e-4;

  constructor() {
    this.scheduler = new Scheduler(() => this.render());
  }

  dispatch(msg: HostMsg): void {
    switch (msg.op) {
      case Op.INIT:
        this.hostId = msg.hostId;
        this.init(msg.canvas, msg.width, msg.height, msg.dpr, msg.bgColor);
        break;
      case Op.SET_BG_COLOR:
        this.bgColor = msg.color;
        this.scheduler.markDirty();
        break;
      case Op.RESIZE:
        this.resize(msg.width, msg.height, msg.dpr);
        break;
      case Op.ADD_LAYER: {
        const layer = createLayer(msg.id, msg.kind);
        if (msg.config !== undefined) layer.setConfig(msg.config);
        layer.resize(this.viewport);
        this.stack.add(layer);
        this.syncContinuousMode();
        this.scheduler.markDirty();
        break;
      }
      case Op.REMOVE_LAYER:
        this.stack.remove(msg.id);
        this.syncContinuousMode();
        this.scheduler.markDirty();
        break;
      case Op.CONFIG: {
        const layer = this.stack.get(msg.id);
        if (layer) {
          layer.setConfig(msg.config);
          this.syncContinuousMode();
          this.scheduler.markDirty();
        }
        break;
      }
      case Op.DATA: {
        const layer = this.stack.get(msg.id);
        if (layer) {
          layer.setData(msg.buffer, msg.length, this.viewport);
          this.scheduler.markDirty();
        }
        break;
      }
      case Op.CLEAR_DATA: {
        const layer = this.stack.get(msg.id);
        layer?.clearData?.();
        // `latestT` is normally monotonic-up (advanced by layer setData).
        // An explicit rewind here is the only path a backward replay seek
        // can use to drag the time-mode axis window with it.
        if (msg.latestT !== undefined) {
          this.viewport.latestT = msg.latestT;
        }
        this.scheduler.markDirty();
        break;
      }
      case Op.DISPOSE:
        this.dispose();
        break;
      case Op.SET_AXIS_CANVAS:
        this.setAxisCanvas(msg as SetAxisCanvasMsg);
        break;
      case Op.SET_AXIS_STYLE: {
        const { color, font, tickSize, tickMargin, bgColor } = msg as {
          color?: string;
          font?: string;
          tickSize?: number;
          tickMargin?: number;
          bgColor?: string;
        };
        if (color !== undefined) this.axisStyle.color = color;
        if (font !== undefined) this.axisStyle.font = font;
        if (tickSize !== undefined) this.axisStyle.tickSize = tickSize;
        if (tickMargin !== undefined) this.axisStyle.tickMargin = tickMargin;
        if (bgColor !== undefined) this.axisStyle.bgColor = bgColor;
        this.scheduler.markDirty();
        break;
      }
      case Op.SET_VISIBLE: {
        this.visible = msg.visible;
        if (msg.visible) {
          // Re-anchor the follow-clock window to the current wall clock so it
          // jumps once to true "now" (elapsed hidden time is real) instead of
          // resuming from a stale anchor.
          this.stack
            .findFirst((l): l is AxisGridLayer => l instanceof AxisGridLayer)
            ?.resetClockAnchor();
          this.scheduler.markDirty();
        }
        this.syncContinuousMode();
        break;
      }
    }
  }

  private setAxisCanvas(msg: SetAxisCanvasMsg): void {
    this.xAxisHeight = msg.xAxisHeight;
    this.yAxisWidth = msg.yAxisWidth;
    if (msg.xAxisCanvas) {
      this.xAxisCanvas = msg.xAxisCanvas;
      this.xAxisCtx = msg.xAxisCanvas.getContext("2d");
    }
    if (msg.yAxisCanvas) {
      this.yAxisCanvas = msg.yAxisCanvas;
      this.yAxisCtx = msg.yAxisCanvas.getContext("2d");
    }
    // Size the axis canvases to match the current viewport.
    this.resizeAxisCanvases(
      this.viewport.widthPx,
      this.viewport.heightPx,
      this.viewport.dpr,
    );
    this.scheduler.markDirty();
  }

  private init(
    canvas: OffscreenCanvas,
    width: number,
    height: number,
    dpr: number,
    bgColor?: string,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (bgColor !== undefined) this.bgColor = bgColor;
    this.resize(width, height, dpr);
    this.scheduler.start();
    this.scheduler.markDirty();
  }

  private resize(width: number, height: number, dpr: number) {
    if (!this.canvas) return;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.viewport.setSize(width, height, dpr);
    this.stack.resizeAll(this.viewport);
    this.resizeAxisCanvases(width, height, dpr);
    this.scheduler.markDirty();
  }

  private resizeAxisCanvases(width: number, height: number, dpr: number): void {
    if (this.xAxisCanvas) {
      this.xAxisCanvas.width = Math.max(1, Math.round(width * dpr));
      this.xAxisCanvas.height = Math.max(1, Math.round(this.xAxisHeight * dpr));
    }
    if (this.yAxisCanvas) {
      this.yAxisCanvas.width = Math.max(1, Math.round(this.yAxisWidth * dpr));
      this.yAxisCanvas.height = Math.max(1, Math.round(height * dpr));
    }
  }

  private render() {
    const ctx = this.ctx;
    /* v8 ignore start -- render only runs via the scheduler after init; ctx/canvas are always set */
    if (!ctx || !this.canvas) return;
    /* v8 ignore stop */
    // 2-pass: scan (orchestration: time window, observed y, bounds) then
    // draw. AxisGridLayer.scan writes bounds; LineChartLayer.scan reads
    // bounds and publishes observed y extents; AxisGridLayer.draw finishes
    // the y-auto computation using those extents.
    this.viewport.beginScan();
    this.stack.scanAll(this.viewport);
    const { dpr } = this.viewport;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, this.viewport.widthPx, this.viewport.heightPx);
    this.stack.drawAll(ctx, this.viewport);

    // Notify main thread when effective y bounds change (yMode:"auto").
    // Uses an epsilon gate so sub-pixel drift doesn't flood the main thread.
    const { yMin, yMax } = this.viewport.bounds;
    const range = yMax - yMin || 1;
    const eps = range * Engine.BOUNDS_EPS;
    // `lastSentYMin/Max` start as NaN; `Math.abs(y - NaN) > eps` is always false,
    // which would suppress the very first BOUNDS_UPDATE forever. Treat an unset
    // (NaN) baseline as "changed" so the initial bounds are reported.
    const boundsChanged =
      Number.isNaN(this.lastSentYMin) ||
      Math.abs(yMin - this.lastSentYMin) > eps ||
      Math.abs(yMax - this.lastSentYMax) > eps;
    if (boundsChanged) {
      this.lastSentYMin = yMin;
      this.lastSentYMax = yMax;
      try {
        self.postMessage({
          op: WorkerOp.BOUNDS_UPDATE,
          hostId: this.hostId,
          yMin,
          yMax,
          latestT: this.viewport.latestT,
        });
      } catch {
        // Worker context may not support postMessage in tests
      }
    }

    // Draw axis canvases synchronously in the same rAF cycle (zero lag).
    const axisLayer = this.stack.findFirst(
      (l): l is AxisGridLayer => l instanceof AxisGridLayer,
    );
    if (axisLayer) {
      if (this.xAxisCtx && this.xAxisCanvas) {
        this.xAxisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        axisLayer.drawXAxis(
          this.xAxisCtx,
          this.xAxisCanvas.width / dpr,
          this.xAxisHeight,
          this.axisStyle,
        );
      }
      if (this.yAxisCtx && this.yAxisCanvas) {
        this.yAxisCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        axisLayer.drawYAxis(
          this.yAxisCtx,
          this.yAxisWidth,
          this.yAxisCanvas.height / dpr,
          this.axisStyle,
          this.viewport.yPadPx,
        );
      }
    }

    // Only send TICK_UPDATE when axis canvases are not present (React-side fallback).
    if (!this.xAxisCanvas && !this.yAxisCanvas) {
      this.maybeSendTickUpdate(boundsChanged);
    }
  }

  private maybeSendTickUpdate(boundsChanged: boolean): void {
    const axisLayer = this.stack.findFirst(
      (l): l is AxisGridLayer => l instanceof AxisGridLayer,
    );
    if (!axisLayer) return;

    const now = Date.now();
    const xInterval = axisLayer.getXTickIntervalMs() ?? 1000;
    const xChanged = now - this.lastSentXTickMs >= xInterval;

    if (!xChanged && !boundsChanged) return;

    if (xChanged) this.lastSentXTickMs = now;

    const ticks = axisLayer.computeTicksForExport();
    try {
      self.postMessage({
        op: WorkerOp.TICK_UPDATE,
        hostId: this.hostId,
        xTicks: ticks.xTicks,
        yTicks: ticks.yTicks,
        xRawValues: ticks.xRawValues,
      } satisfies TickUpdateMsg);
    } catch {
      // Worker context may not support postMessage in tests
    }
  }

  /**
   * Push a pre-parsed Float32Array directly into a layer's ring buffer.
   * Called from a custom worker streamHandler — bypasses HostMsg serialization.
   * Data layout must match what the layer expects (e.g. [t, y, t, y, …] for line).
   */
  /**
   * Enable continuous rendering when the stack's axis layer is following the
   * wall clock (time-mode + followClock + timeOrigin); disable it otherwise so
   * static/data-driven charts keep their zero-idle-cost dirty-gated loop.
   * Called after any op that can change layer presence or config.
   */
  private syncContinuousMode(): void {
    const follow =
      this.stack
        .findFirst((l): l is AxisGridLayer => l instanceof AxisGridLayer)
        ?.isFollowingClock() ?? false;
    // Suspend the continuous loop while the page is hidden — no point scrolling
    // an axis nobody can see, and it saves CPU/battery.
    this.scheduler.setContinuous(this.visible && follow);
  }

  pushRaw(layerId: string, data: Float32Array): void {
    const layer = this.stack.get(layerId);
    if (!layer) return;
    layer.setData(data.buffer as ArrayBuffer, data.length, this.viewport);
    this.scheduler.markDirty();
  }

  private dispose() {
    this.scheduler.stop();
    this.stack.disposeAll();
    this.canvas = null;
    this.ctx = null;
  }
}
