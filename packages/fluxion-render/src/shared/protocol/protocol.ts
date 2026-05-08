/**
 * Binary message protocol between main-thread `FluxionHost` and worker `Engine`.
 * Uses a plain const object (not const enum) so consumers with
 * `isolatedModules` can import types safely from the published package.
 */
export const Op = {
  INIT: 1,
  RESIZE: 2,
  ADD_LAYER: 3,
  REMOVE_LAYER: 4,
  CONFIG: 5,
  DATA: 6,
  DISPOSE: 7,
  SET_BG_COLOR: 8,
  POOL_INIT: 9,
  POOL_DISPOSE: 10,
  SET_AXIS_CANVAS: 11,
  SET_AXIS_STYLE: 12,
} as const;
export type Op = (typeof Op)[keyof typeof Op];

export type LayerKind = "line" | "line-static" | "lidar" | "axis-grid" | "scatter";

export type DType = "f32" | "u8" | "i16" | "u16" | "i32";

export interface InitMsg {
  op: typeof Op.INIT;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  /**
   * Optional canvas background color. Applied every frame before layers draw.
   * Default (when omitted): `"#0b0d12"` — matches the engine's dark default.
   */
  bgColor?: string;
  hostId?: string;
}

export interface ResizeMsg {
  op: typeof Op.RESIZE;
  width: number;
  height: number;
  dpr: number;
  hostId?: string;
}

export interface AddLayerMsg {
  op: typeof Op.ADD_LAYER;
  id: string;
  kind: LayerKind;
  config?: unknown;
  hostId?: string;
}

export interface RemoveLayerMsg {
  op: typeof Op.REMOVE_LAYER;
  id: string;
  hostId?: string;
}

export interface ConfigMsg {
  op: typeof Op.CONFIG;
  id: string;
  config: unknown;
  hostId?: string;
}

export interface DataMsg {
  op: typeof Op.DATA;
  id: string;
  buffer: ArrayBuffer;
  dtype: DType;
  length: number;
  hostId?: string;
}

export interface DisposeMsg {
  op: typeof Op.DISPOSE;
  hostId?: string;
}

/**
 * Canvas-scope (engine-level) background color update. Takes effect on the
 * next rendered frame. Separate from `CONFIG` because `CONFIG` is layer-scope.
 */
export interface SetBgColorMsg {
  op: typeof Op.SET_BG_COLOR;
  color: string;
  hostId?: string;
}

/** Pool-only: register a new engine for `hostId` in the worker. */
export interface PoolInitMsg {
  op: typeof Op.POOL_INIT;
  hostId: string;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  bgColor?: string;
}

/** Pool-only: tear down the engine for `hostId` without terminating the worker. */
export interface PoolDisposeMsg {
  op: typeof Op.POOL_DISPOSE;
  hostId: string;
}

/** Axis canvas style configuration. */
export interface AxisStyle {
  color?: string;
  font?: string;
  tickSize?: number;
  tickMargin?: number;
  bgColor?: string;
}

/**
 * Transfer axis OffscreenCanvas(es) to the worker engine.
 * Sent after INIT/POOL_INIT so the canvases can be in separate Transferable arrays.
 */
export interface SetAxisCanvasMsg {
  op: typeof Op.SET_AXIS_CANVAS;
  hostId?: string;
  xAxisCanvas?: OffscreenCanvas;
  yAxisCanvas?: OffscreenCanvas;
  xAxisHeight: number;
  yAxisWidth: number;
}

/** Update axis rendering style (color, font, tick size, etc.). */
export interface SetAxisStyleMsg {
  op: typeof Op.SET_AXIS_STYLE;
  hostId?: string;
  color?: string;
  font?: string;
  tickSize?: number;
  tickMargin?: number;
  bgColor?: string;
}

export type HostMsg =
  | InitMsg
  | ResizeMsg
  | AddLayerMsg
  | RemoveLayerMsg
  | ConfigMsg
  | DataMsg
  | DisposeMsg
  | SetBgColorMsg
  | PoolInitMsg
  | PoolDisposeMsg
  | SetAxisCanvasMsg
  | SetAxisStyleMsg;

// ────────────────────────────────────────────────────────────────────────
// Worker → Main messages (posted via self.postMessage inside the worker)
// ────────────────────────────────────────────────────────────────────────

export const WorkerOp = {
  BOUNDS_UPDATE: 100,
  TICK_UPDATE: 101,
} as const;
export type WorkerOp = (typeof WorkerOp)[keyof typeof WorkerOp];

/**
 * Sent by the engine after each draw frame when the effective y-bounds
 * have changed. Enables the React-side `useAxisTicks` hook to show live
 * y-axis labels for `yMode: "auto"`.
 * `latestT` is the worker-side `viewport.latestT` so the external x-axis
 * uses the same time origin as the canvas grid lines.
 */
export interface BoundsUpdateMsg {
  op: typeof WorkerOp.BOUNDS_UPDATE;
  hostId?: string;
  yMin: number;
  yMax: number;
  latestT: number;
}

/** Serialized form of a single axis tick. structuredClone-safe. */
export interface SerializedTick {
  value: number;
  label: string;
  fraction: number;
}

/**
 * Sent by the engine after each draw frame when ticks need updating.
 * Replaces the main-thread setInterval-based tick computation in
 * `useAxisTicks`. `xRawValues` is populated only when `xTickFormat` is a
 * function — the main thread applies the function and fills in the labels.
 */
export interface TickUpdateMsg {
  op: typeof WorkerOp.TICK_UPDATE;
  hostId?: string;
  xTicks: SerializedTick[];
  yTicks: SerializedTick[];
  /** Raw x tick values when xTickFormat is a function (main-thread post-processing). */
  xRawValues: number[];
}

export type WorkerMsg = BoundsUpdateMsg | TickUpdateMsg;
