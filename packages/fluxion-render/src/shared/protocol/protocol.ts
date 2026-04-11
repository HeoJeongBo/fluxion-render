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
}

export interface ResizeMsg {
  op: typeof Op.RESIZE;
  width: number;
  height: number;
  dpr: number;
}

export interface AddLayerMsg {
  op: typeof Op.ADD_LAYER;
  id: string;
  kind: LayerKind;
  config?: unknown;
}

export interface RemoveLayerMsg {
  op: typeof Op.REMOVE_LAYER;
  id: string;
}

export interface ConfigMsg {
  op: typeof Op.CONFIG;
  id: string;
  config: unknown;
}

export interface DataMsg {
  op: typeof Op.DATA;
  id: string;
  buffer: ArrayBuffer;
  dtype: DType;
  length: number;
}

export interface DisposeMsg {
  op: typeof Op.DISPOSE;
}

export type HostMsg =
  | InitMsg
  | ResizeMsg
  | AddLayerMsg
  | RemoveLayerMsg
  | ConfigMsg
  | DataMsg
  | DisposeMsg;
