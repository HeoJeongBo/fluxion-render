export {
  configureDefaultPool,
  FluxionHost,
  FluxionWorkerPool,
  getDefaultPool,
  type FluxionWorkerPoolOptions,
} from "./features/host";
export type { LayerKind } from "./shared/protocol";
export {
  axisGridLayer,
  FluxionCanvas,
  lidarLayer,
  lineLayer,
  lineStaticLayer,
  useFluxionCanvas,
  useFluxionStream,
  useFluxionWorkerPool,
  useLayerConfig,
  useResizeObserver,
  type FluxionCanvasHandle,
  type FluxionCanvasProps,
  type FluxionLayerSpec,
  type ResizeInfo,
  type UseFluxionCanvasOptions,
  type UseFluxionCanvasResult,
  type UseFluxionStreamOptions,
  type UseFluxionStreamResult,
} from "./widgets/fluxion-canvas";
