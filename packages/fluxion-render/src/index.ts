export { createFluxionWorkerFactory } from "./app/worker/create-worker-factory";
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
export type { OccupancyGridConfig } from "./entities/occupancy-grid-layer";
export type { PoseArrowConfig } from "./entities/pose-arrow-layer";
export type { ReferenceLineConfig } from "./entities/reference-line-layer";
export type { ScatterChartConfig } from "./entities/scatter-chart-layer";
export type { ScatterColoredConfig } from "./entities/scatter-colored-layer";
export type { StepChartConfig } from "./entities/step-chart-layer";
export type { TrajectoryConfig } from "./entities/trajectory-layer";
export {
  type BrushSelection,
  FluxionBrush,
  type FluxionBrushProps,
  type UseFluxionBrushOptions,
  type UseFluxionBrushResult,
  useFluxionBrush,
} from "./features/brush";
export type { CachedLayerOptions } from "./features/crosshair";
export { HoverDataCache } from "./features/crosshair";
export {
  type UseFluxionExportOptions,
  type UseFluxionExportResult,
  useFluxionExport,
} from "./features/export";
export {
  FluxionGauge,
  type FluxionGaugeClassNames,
  type FluxionGaugeProps,
  type GaugeThreshold,
  type UseFluxionGaugeOptions,
  type UseFluxionGaugeResult,
  useFluxionGauge,
} from "./features/gauge";
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
  OccupancyGrid,
  PoseArrowSample,
  ScatterColoredSample,
  ScatterSample,
  TrajectorySample,
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
  OccupancyGridHandle,
  PoseArrowHandle,
  ReferenceLineHandle,
  ScatterColoredHandle,
  ScatterLayerHandle,
  StepLayerHandle,
  TrajectoryHandle,
} from "./features/host";
export {
  FluxionPieChart,
  type FluxionPieChartClassNames,
  type FluxionPieChartProps,
  type PieSlice,
} from "./features/pie";
export {
  type UseSyncedTimeWindowResult,
  useSyncedTimeWindow,
} from "./features/synced-time";
export type {
  AxisTick,
  AxisTickSet,
  ComputeAxisTicksOptions,
  XTickFormat,
  XTickFormatOptions,
  YTickFormat,
  YTickFormatOptions,
} from "./shared/lib/axis-ticks";
export { computeAxisTicks, formatTick, formatYTick } from "./shared/lib/axis-ticks";
export { DASH_PATTERNS, dashPatternFor } from "./shared/lib/dash-patterns";
export type { TickFormatter } from "./shared/lib/time-format";
export { formatClock, makeClockFormatter } from "./shared/lib/time-format";
export type { DType, FluxionPoolStreamMsg, HostMsg, LayerKind } from "./shared/protocol";
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
  occupancyGridLayer,
  poseArrowLayer,
  referenceLineLayer,
  scatterColoredLayer,
  scatterLayer,
  stepLayer,
  trajectoryLayer,
} from "./widgets/fluxion-canvas/lib/layer-specs";
export type { FluxionLayerSpec } from "./widgets/fluxion-canvas/lib/use-fluxion-canvas";
