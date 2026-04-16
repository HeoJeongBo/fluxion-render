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
} as const;
export type Op = (typeof Op)[keyof typeof Op];

export type LayerKind = "line" | "line-static" | "lidar" | "axis-grid";

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
  | PoolDisposeMsg;
