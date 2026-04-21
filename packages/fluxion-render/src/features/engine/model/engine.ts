import { AxisGridLayer } from "../../../entities/axis-grid-layer";
import { LayerStack } from "../../../entities/layer-stack";
import { LidarScatterLayer } from "../../../entities/lidar-scatter-layer";
import { LineChartLayer } from "../../../entities/line-chart-layer";
import { LineChartStaticLayer } from "../../../entities/line-chart-static-layer";
import type { Layer } from "../../../shared/model/layer";
import { Scheduler } from "../../../shared/model/scheduler";
import { Viewport } from "../../../shared/model/viewport";
import type { HostMsg, LayerKind } from "../../../shared/protocol";
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
  }
}

/**
 * Worker-side engine. Owns the OffscreenCanvas, layer stack, viewport,
 * and render scheduler. All state lives here; main thread just pushes messages.
 */
export class Engine {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private readonly viewport = new Viewport();
  private readonly stack = new LayerStack();
  private readonly scheduler: Scheduler;
  private bgColor = "#0b0d12";
  private hostId: string | undefined;
  private lastSentYMin = Number.NaN;
  private lastSentYMax = Number.NaN;
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
        this.scheduler.markDirty();
        break;
      }
      case Op.REMOVE_LAYER:
        this.stack.remove(msg.id);
        this.scheduler.markDirty();
        break;
      case Op.CONFIG: {
        const layer = this.stack.get(msg.id);
        if (layer) {
          layer.setConfig(msg.config);
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
      case Op.DISPOSE:
        this.dispose();
        break;
    }
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
    this.scheduler.markDirty();
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
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
    if (
      Math.abs(yMin - this.lastSentYMin) > eps ||
      Math.abs(yMax - this.lastSentYMax) > eps
    ) {
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
  }

  private dispose() {
    this.scheduler.stop();
    this.stack.disposeAll();
    this.canvas = null;
    this.ctx = null;
  }
}
