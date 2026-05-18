export { createFluxionWorkerFactory } from "./app/worker/create-worker-factory";
export { HoverDataCache } from "./features/crosshair";
export type { CachedLayerOptions } from "./features/crosshair";
export type { AreaChartConfig } from "./entities/area-chart-layer";
export type { AxisGridConfig } from "./entities/axis-grid-layer";
export type { BarChartConfig } from "./entities/bar-chart-layer";
export type { CandlestickConfig } from "./entities/candlestick-layer";
export type { EventMarkerConfig } from "./entities/event-marker-layer";
export type { HeatmapConfig } from "./entities/heatmap-layer";
export type { HeatmapStreamConfig } from "./entities/heatmap-stream-layer";
export type { LidarScatterConfig } from "./entities/lidar-scatter-layer";
export type { LineChartConfig } from "./entities/line-chart-layer";
export type { LineChartStaticConfig } from "./entities/line-chart-static-layer";
export type { ScatterChartConfig } from "./entities/scatter-chart-layer";
export type { ScatterColoredConfig } from "./entities/scatter-colored-layer";
export type { StepChartConfig } from "./entities/step-chart-layer";
export type {
  CandlestickSample,
  EventSeverity,
  FluxionDataSink,
  FluxionHostOptions,
  FluxionTypedArray,
  FluxionWorkerPoolOptions,
  HeatmapPoint,
  LidarPoint,
  LidarStride,
  LineSample,
  MarkerEvent,
  ScatterColoredSample,
  ScatterSample,
  XyPoint,
} from "./features/host";
export {
  AreaLayerHandle,
  BarLayerHandle,
  CandlestickLayerHandle,
  configureDefaultPool,
  EventMarkerHandle,
  FluxionHost,
  FluxionWorkerPool,
  getDefaultPool,
  HeatmapLayerHandle,
  HeatmapStreamHandle,
  LidarLayerHandle,
  LineLayerHandle,
  LineStaticLayerHandle,
  ScatterColoredHandle,
  ScatterLayerHandle,
  StepLayerHandle,
} from "./features/host";
export type {
  AxisTick,
  AxisTickSet,
  ComputeAxisTicksOptions,
} from "./shared/lib/axis-ticks";
export { computeAxisTicks, formatTick } from "./shared/lib/axis-ticks";
export type { TickFormatter } from "./shared/lib/time-format";
export { formatClock, makeClockFormatter } from "./shared/lib/time-format";
export type { DType, HostMsg, LayerKind } from "./shared/protocol";
export {
  areaLayer,
  axisGridLayer,
  barLayer,
  candlestickLayer,
  eventMarkerLayer,
  heatmapLayer,
  heatmapStreamLayer,
  lidarLayer,
  lineLayer,
  lineStaticLayer,
  scatterColoredLayer,
  scatterLayer,
  stepLayer,
} from "./widgets/fluxion-canvas/lib/layer-specs";
export type { FluxionLayerSpec } from "./widgets/fluxion-canvas/lib/use-fluxion-canvas";
export {
  FluxionGauge,
  useFluxionGauge,
  type FluxionGaugeProps,
  type GaugeThreshold,
  type UseFluxionGaugeOptions,
  type UseFluxionGaugeResult,
} from "./features/gauge";
export {
  useSyncedTimeWindow,
  type UseSyncedTimeWindowResult,
} from "./features/synced-time";
export {
  FluxionBrush,
  useFluxionBrush,
  type BrushSelection,
  type FluxionBrushProps,
  type UseFluxionBrushOptions,
  type UseFluxionBrushResult,
} from "./features/brush";
export {
  useFluxionExport,
  type UseFluxionExportOptions,
  type UseFluxionExportResult,
} from "./features/export";
