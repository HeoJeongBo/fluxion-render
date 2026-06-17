import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { LidarScatterConfig } from "../../../entities/lidar-scatter-layer";
import type { LineChartConfig } from "../../../entities/line-chart-layer";
import type { LineChartStaticConfig } from "../../../entities/line-chart-static-layer";
import type { FluxionWorkerPool } from "../../../features/worker-pool";
import { getDefaultPool } from "../../../features/worker-pool";
import {
  type AxisStyle,
  type BoundsUpdateMsg,
  type DType,
  type FluxionPoolStreamMsg,
  type HostMsg,
  type LayerKind,
  Op,
  type SerializedTick,
  type TickUpdateMsg,
  type WorkerMsg,
  WorkerOp,
} from "../../../shared/protocol";
import {
  AreaLayerHandle,
  BarLayerHandle,
  CandlestickLayerHandle,
  EventMarkerHandle,
  HeatmapLayerHandle,
  HeatmapStreamHandle,
  HistogramHandle,
  LidarLayerHandle,
  type LidarStride,
  LineLayerHandle,
  LineStaticLayerHandle,
  OccupancyGridHandle,
  PoseArrowHandle,
  ReferenceLineHandle,
  ScatterColoredHandle,
  ScatterLayerHandle,
  StepLayerHandle,
  TrajectoryHandle,
} from "./layer-handles";

/**
 * TypedArray flavors that FluxionRender accepts. `ArrayBufferView` is too
 * permissive (includes DataView), so we narrow to the specific types whose
 * layout matches the worker-side `wrapTypedArray` contract.
 */
export type FluxionTypedArray =
  | Float32Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array;

export interface FluxionHostOptions {
  /**
   * Override the worker URL. Useful when bundlers don't support
   * `new Worker(new URL('./fluxion-worker.js', import.meta.url))`.
   * Pass a factory that returns a constructed Worker.
   * When provided, bypasses the default worker pool and runs in solo mode.
   */
  workerFactory?: () => Worker;
  /**
   * Canvas background color, applied every frame before layers draw.
   * Defaults to `"#0b0d12"` (dark) when omitted. Use `setBgColor` to change
   * it at runtime (e.g. for a theme toggle).
   */
  bgColor?: string;
  /**
   * Worker pool to use. When omitted, the module-level default pool is used
   * automatically (4 workers shared across all hosts).
   * Use `configureDefaultPool` to change the default pool size.
   */
  pool?: FluxionWorkerPool;
  /**
   * x-axis HTML canvas element. When provided, the Worker renders tick marks
   * and labels directly onto it in the same rAF cycle as the main canvas —
   * eliminating the Main-thread React tick-update lag.
   */
  xAxisElement?: HTMLCanvasElement;
  /**
   * y-axis HTML canvas element. Rendered by the Worker in the same rAF cycle.
   */
  yAxisElement?: HTMLCanvasElement;
  /** Height of the x-axis canvas in CSS px. Default 30. */
  xAxisHeight?: number;
  /** Width of the y-axis canvas in CSS px. Default 60. */
  yAxisWidth?: number;
  /** Axis tick/label style. Defaults: color "#666", font "11px sans-serif", tickSize 6, tickMargin 4. */
  axisStyle?: AxisStyle;
}

function dtypeOf(arr: FluxionTypedArray): DType {
  if (arr instanceof Float32Array) return "f32";
  if (arr instanceof Uint8Array) return "u8";
  if (arr instanceof Int16Array) return "i16";
  if (arr instanceof Uint16Array) return "u16";
  if (arr instanceof Int32Array) return "i32";
  throw new Error(
    `fluxion-render: unsupported TypedArray "${
      /* v8 ignore next -- TypedArrays always have a constructor.name; typeof fallback is defensive */
      (arr as { constructor?: { name?: string } })?.constructor?.name ?? typeof arr
    }". Supported: Float32Array, Uint8Array, Int16Array, Uint16Array, Int32Array.`,
  );
}

/**
 * Main-thread handle to a worker-hosted rendering engine.
 *
 * Lifecycle:
 *   const host = new FluxionHost(canvas);
 *   host.addLayer('chart', 'line', { color: '#0ff' });
 *   host.pushData('chart', float32);   // transfers ownership
 *   host.resize(w, h, dpr);
 *   host.dispose();
 */
/** Callback shape for `onBoundsChange`. */
export type BoundsChangeListener = (yMin: number, yMax: number, latestT: number) => void;

/** Callback shape for `onTickUpdate`. Receives serialized tick arrays from the worker. */
export type TickUpdateListener = (
  xTicks: SerializedTick[],
  yTicks: SerializedTick[],
) => void;

/**
 * Functions can't structuredClone (postMessage throws DataCloneError). Layer
 * configs may carry main-thread-only formatter functions (`xTickFormat` /
 * `yTickFormat`) — drop them here; React-side hooks (`useAxisTicks`) apply
 * them after TICK_UPDATE. Shallow by design: every layer config is flat.
 * Object-form formatters (`{ pattern, precision, ... }`) are NOT functions, so
 * they pass through untouched and reach the worker's draw path intact.
 */
function stripFunctionFields(config: unknown): unknown {
  if (config == null || typeof config !== "object" || Array.isArray(config))
    return config;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    if (typeof v === "function") {
      changed = true;
      continue;
    }
    out[k] = v;
  }
  return changed ? out : config;
}

export class FluxionHost {
  private worker: {
    postMessage(msg: unknown, transfer?: Transferable[]): void;
    terminate(): void;
    addEventListener?(type: string, listener: EventListener): void;
    removeEventListener?(type: string, listener: EventListener): void;
    readonly hostId?: string;
  };
  private disposed = false;
  private boundsListeners: BoundsChangeListener[] = [];
  private tickListeners: TickUpdateListener[] = [];
  private workerMsgHandler: EventListener | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, opts: FluxionHostOptions = {}) {
    if (opts.workerFactory) {
      // Solo mode: caller provided a custom factory — bypass the pool entirely.
      this.worker = opts.workerFactory();
    } else {
      // Pool mode: use the explicit pool or fall back to the module-level default.
      /* v8 ignore start -- default-pool fallback needs a real worker URL, unavailable in unit tests */
      this.worker = (opts.pool ?? getDefaultPool()).acquire();
      /* v8 ignore stop */
    }

    const offscreen = canvas.transferControlToOffscreen();
    /* v8 ignore start -- devicePixelRatio is always defined in the DOM test env; SSR fallback */
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    /* v8 ignore stop */
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width || 300;
    const height = rect.height || canvas.height || 150;

    this.post(
      {
        op: Op.INIT,
        canvas: offscreen,
        width,
        height,
        dpr,
        bgColor: opts.bgColor,
      },
      [offscreen],
    );

    // Transfer axis canvases to the Worker so they render in the same rAF cycle.
    if (opts.xAxisElement || opts.yAxisElement) {
      const xAxisCanvas = opts.xAxisElement?.transferControlToOffscreen();
      const yAxisCanvas = opts.yAxisElement?.transferControlToOffscreen();
      const transfer: Transferable[] = [];
      if (xAxisCanvas) transfer.push(xAxisCanvas);
      if (yAxisCanvas) transfer.push(yAxisCanvas);
      this.post(
        {
          op: Op.SET_AXIS_CANVAS,
          xAxisCanvas,
          yAxisCanvas,
          xAxisHeight: opts.xAxisHeight ?? 30,
          yAxisWidth: opts.yAxisWidth ?? 60,
        },
        transfer,
      );
    }
    if (opts.axisStyle) {
      this.post({ op: Op.SET_AXIS_STYLE, ...opts.axisStyle });
    }

    // Listen for worker→main messages (bounds updates, etc.)
    this.workerMsgHandler = (evt: Event) => {
      const e = evt as MessageEvent<WorkerMsg>;
      const msg = e.data;
      if (!msg || typeof msg !== "object" || !("op" in msg)) return;
      if (msg.op === WorkerOp.BOUNDS_UPDATE) {
        const bu = msg as BoundsUpdateMsg;
        for (const fn of this.boundsListeners) fn(bu.yMin, bu.yMax, bu.latestT);
      }
      if (msg.op === WorkerOp.TICK_UPDATE) {
        const tu = msg as TickUpdateMsg;
        for (const fn of this.tickListeners) fn(tu.xTicks, tu.yTicks);
      }
    };
    if (this.worker.addEventListener) {
      this.worker.addEventListener("message", this.workerMsgHandler);
    }

    // Forward page visibility to the worker (it has no `document`). While
    // hidden, the worker suspends the follow-clock continuous render loop;
    // on becoming visible it re-anchors the window to the current wall clock.
    /* v8 ignore next -- the no-document (SSR) arm is unreachable in the DOM test env */
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        this.post({
          op: Op.SET_VISIBLE,
          visible: document.visibilityState === "visible",
        });
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  /**
   * Update the canvas background color at runtime. Takes effect on the next
   * rendered frame. Useful for theme toggles without tearing down the host.
   */
  setBgColor(color: string): void {
    this.post({ op: Op.SET_BG_COLOR, color });
  }

  /**
   * Register a listener that fires whenever the worker reports new effective
   * y bounds (typically once per frame when `yMode: "auto"` causes a change).
   * Returns an unsubscribe function.
   */
  onBoundsChange(listener: BoundsChangeListener): () => void {
    this.boundsListeners.push(listener);
    return () => {
      const idx = this.boundsListeners.indexOf(listener);
      if (idx >= 0) this.boundsListeners.splice(idx, 1);
    };
  }

  /**
   * Register a listener that fires whenever the worker sends updated tick data.
   * Replaces the main-thread setInterval in `useAxisTicks` — tick computation
   * now runs in the worker and is pushed here after each rendered frame.
   * Returns an unsubscribe function.
   */
  onTickUpdate(listener: TickUpdateListener): () => void {
    this.tickListeners.push(listener);
    return () => {
      const idx = this.tickListeners.indexOf(listener);
      if (idx >= 0) this.tickListeners.splice(idx, 1);
    };
  }

  /**
   * Typed `addLayer` overloads.
   *
   * Prefer the kind-specific helpers below (`addLineLayer`, `addAxisLayer`,
   * etc.) — they both type-check the config AND return a typed handle where
   * applicable. This overload is retained for cases where the kind is chosen
   * dynamically.
   */
  addLayer(id: string, kind: "line", config?: LineChartConfig): void;
  addLayer(id: string, kind: "line-static", config?: LineChartStaticConfig): void;
  addLayer(id: string, kind: "lidar", config?: LidarScatterConfig): void;
  addLayer(id: string, kind: "axis-grid", config?: AxisGridConfig): void;
  // Dynamic fallback for code paths that pass a runtime `LayerKind` (e.g.
  // `useFluxionCanvas({ layers: FluxionLayerSpec[] })`).
  addLayer(id: string, kind: LayerKind, config?: unknown): void;
  addLayer(id: string, kind: LayerKind, config?: unknown): void {
    this.post({ op: Op.ADD_LAYER, id, kind, config: stripFunctionFields(config) });
  }

  removeLayer(id: string): void {
    this.post({ op: Op.REMOVE_LAYER, id });
  }

  /**
   * Typed `configLayer` overloads — pick the config shape from the kind used
   * when the layer was created. There's no runtime tag check; the caller is
   * trusted to pass the right config for the right id.
   */
  configLayer(id: string, config: LineChartConfig): void;
  configLayer(id: string, config: LineChartStaticConfig): void;
  configLayer(id: string, config: LidarScatterConfig): void;
  configLayer(id: string, config: AxisGridConfig): void;
  // Dynamic fallback for helpers like `useLayerConfig` that carry an opaque
  // config alongside the layer id.
  configLayer(id: string, config: unknown): void;
  configLayer(id: string, config: unknown): void {
    this.post({ op: Op.CONFIG, id, config: stripFunctionFields(config) });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Typed add-layer helpers: construct + return a typed handle in one call.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Add a streaming line layer and return a handle that accepts structured
   * `{ t, y }` samples instead of raw Float32Array interleaved layout.
   */
  addLineLayer(id: string, config?: LineChartConfig): LineLayerHandle {
    this.addLayer(id, "line", config);
    return new LineLayerHandle(this, id);
  }

  /**
   * Add a static xy line layer and return a handle that accepts
   * `{ x, y }[]` or plain y-only arrays.
   */
  addLineStaticLayer(id: string, config?: LineChartStaticConfig): LineStaticLayerHandle {
    this.addLayer(id, "line-static", config);
    return new LineStaticLayerHandle(this, id);
  }

  /**
   * Add a LiDAR scatter layer and return a handle that accepts
   * `{ x, y, z?, intensity? }[]`. The handle's stride must match
   * `config.stride` (default 4).
   */
  addLidarLayer(id: string, config?: LidarScatterConfig): LidarLayerHandle {
    this.addLayer(id, "lidar", config);
    const stride = (config?.stride as LidarStride | undefined) ?? 4;
    return new LidarLayerHandle(this, id, stride);
  }

  /**
   * Add an axis/grid layer. Axis layers don't take data, so this returns
   * void — use `configLayer` to retune bounds / time window later.
   */
  addAxisLayer(id: string, config?: AxisGridConfig): void {
    this.addLayer(id, "axis-grid", config);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Attach a typed handle to a layer that was added via another API path
  // (e.g. declaratively through `<FluxionCanvas layers={...}>` or
  // `useFluxionCanvas({ layers: [...] })`).
  // ──────────────────────────────────────────────────────────────────────

  line(id: string): LineLayerHandle {
    return new LineLayerHandle(this, id);
  }

  lineStatic(id: string): LineStaticLayerHandle {
    return new LineStaticLayerHandle(this, id);
  }

  lidar(id: string, stride: LidarStride = 4): LidarLayerHandle {
    return new LidarLayerHandle(this, id, stride);
  }

  scatter(id: string): ScatterLayerHandle {
    return new ScatterLayerHandle(this, id);
  }

  area(id: string): AreaLayerHandle {
    return new AreaLayerHandle(this, id);
  }

  step(id: string): StepLayerHandle {
    return new StepLayerHandle(this, id);
  }

  bar(id: string): BarLayerHandle {
    return new BarLayerHandle(this, id);
  }

  candlestick(id: string): CandlestickLayerHandle {
    return new CandlestickLayerHandle(this, id);
  }

  heatmap(id: string): HeatmapLayerHandle {
    return new HeatmapLayerHandle(this, id);
  }

  eventMarker(id: string): EventMarkerHandle {
    return new EventMarkerHandle(this, id);
  }

  scatterColored(id: string): ScatterColoredHandle {
    return new ScatterColoredHandle(this, id);
  }

  heatmapStream(id: string): HeatmapStreamHandle {
    return new HeatmapStreamHandle(this, id);
  }

  referenceLine(id: string): ReferenceLineHandle {
    return new ReferenceLineHandle(this, id);
  }

  poseArrow(id: string): PoseArrowHandle {
    return new PoseArrowHandle(this, id);
  }

  trajectory(id: string): TrajectoryHandle {
    return new TrajectoryHandle(this, id);
  }

  occupancyGrid(id: string): OccupancyGridHandle {
    return new OccupancyGridHandle(this, id);
  }

  histogram(id: string): HistogramHandle {
    return new HistogramHandle(this, id);
  }

  /**
   * Push TypedArray data to a layer. Transfers the underlying ArrayBuffer —
   * the caller MUST NOT use `data` again afterwards.
   *
   * The TypedArray must start at byteOffset 0 because the worker reconstructs
   * the view at offset 0. Subviews would silently read from the wrong offset,
   * so they're rejected up-front. Use `data.slice()` to get a fresh buffer.
   */
  pushData(id: string, data: FluxionTypedArray): void {
    if (data.byteOffset !== 0) {
      throw new Error(
        `fluxion-render: TypedArray must start at byteOffset 0 (got ${data.byteOffset}). ` +
          `Call .slice() to copy into a fresh buffer before pushing.`,
      );
    }
    const buffer = data.buffer as ArrayBuffer;
    this.post(
      {
        op: Op.DATA,
        id,
        buffer,
        dtype: dtypeOf(data),
        length: data.length,
      },
      [buffer],
    );
  }

  /**
   * Transfer a raw Float32Array to the custom worker's `streamHandler` (zero-copy).
   * After this call, `buffer` is detached — do not read it again.
   *
   * Only meaningful when the host was created with `workerFactory` pointing at
   * a custom worker script that uses `defineWorkerWithState(rpcHandler, streamHandler)`.
   * The streamHandler receives `{ id, buffer, length, mode: "stream" }`.
   */
  emitStream(id: string, buffer: ArrayBuffer, length: number): void {
    if (this.disposed) return;
    const msg = { id, buffer, length, mode: "stream" as const };
    this.worker.postMessage(msg, [buffer]);
  }

  /**
   * The unique identifier for this host's Engine instance in the worker.
   * In pool mode this is the `hostId` assigned by the pool; in solo mode it is `"__solo__"`.
   * Use this to build the `targets` array for `emitPoolStream`.
   */
  get hostId(): string {
    return this.worker.hostId ?? "__solo__";
  }

  /**
   * Fan-out a single buffer to multiple Engine instances on the same worker (zero-copy).
   * The buffer is decoded once on the worker, then `pushRaw` is called for each target.
   *
   * All target `hostId`s must reside on the same worker as this host.
   * Use a size-1 pool (`useFluxionWorkerPool({ size: 1 })`) to guarantee co-location.
   * After this call, `buffer` is detached — do not read it again.
   */
  emitPoolStream(
    targets: FluxionPoolStreamMsg["targets"],
    buffer: ArrayBuffer,
    length: number,
  ): void {
    if (this.disposed) return;
    const msg: FluxionPoolStreamMsg = { mode: "pool-stream", targets, buffer, length };
    this.worker.postMessage(msg, [buffer]);
  }

  /**
   * Clear a layer's data buffer (ring buffer for streaming layers) without
   * removing the layer or touching its config. Pass `latestT` to force the
   * worker's time-mode axis window to rewind — needed when a replay player
   * seeks backward, since `viewport.latestT` is otherwise monotonic-up.
   *
   * Pair with `LineLayerHandle.reset(latestT)` for a typed call site.
   */
  clearLayer(id: string, opts?: { latestT?: number }): void {
    this.post({ op: Op.CLEAR_DATA, id, latestT: opts?.latestT });
  }

  resize(width: number, height: number, dpr: number): void {
    this.post({ op: Op.RESIZE, width, height, dpr });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Remove worker→main message listener
    if (this.workerMsgHandler && this.worker.removeEventListener) {
      this.worker.removeEventListener("message", this.workerMsgHandler);
    }
    this.workerMsgHandler = null;
    /* v8 ignore next -- the no-handler / no-document arms are unreachable in the DOM test env */
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
    this.boundsListeners.length = 0;
    this.tickListeners.length = 0;
    try {
      this.post({ op: Op.DISPOSE });
    } catch {
      // worker may already be gone
    }
    this.worker.terminate();
  }

  private post(msg: HostMsg, transfer?: Transferable[]): void {
    if (this.disposed) return;
    if (transfer && transfer.length) {
      this.worker.postMessage(msg, transfer);
    } else {
      this.worker.postMessage(msg);
    }
  }
}
