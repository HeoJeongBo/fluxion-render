import type { AreaChartConfig } from "../../../entities/area-chart-layer";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { BarChartConfig } from "../../../entities/bar-chart-layer";
import type { CandlestickConfig } from "../../../entities/candlestick-layer";
import type { HeatmapConfig } from "../../../entities/heatmap-layer";
import type { LidarScatterConfig } from "../../../entities/lidar-scatter-layer";
import type { LineChartConfig } from "../../../entities/line-chart-layer";
import type { LineChartStaticConfig } from "../../../entities/line-chart-static-layer";
import type { ScatterChartConfig } from "../../../entities/scatter-chart-layer";
import type { StepChartConfig } from "../../../entities/step-chart-layer";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

/**
 * Layer factory helpers. Each one binds a `kind` to the matching config
 * type so callers never write the kind string themselves and the config
 * fields are checked at the call site.
 *
 * ```ts
 * useFluxionCanvas({
 *   layers: [
 *     axisGridLayer("axis", { xMode: "time", timeWindowMs: 5000 }),
 *     lineLayer("chart", { color: "#4fc3f7" }),
 *   ],
 * });
 * ```
 */

export function lineLayer(id: string, config?: LineChartConfig): FluxionLayerSpec {
  return { id, kind: "line", config };
}

export function lineStaticLayer(
  id: string,
  config?: LineChartStaticConfig,
): FluxionLayerSpec {
  return { id, kind: "line-static", config };
}

export function lidarLayer(id: string, config?: LidarScatterConfig): FluxionLayerSpec {
  return { id, kind: "lidar", config };
}

export function axisGridLayer(id: string, config?: AxisGridConfig): FluxionLayerSpec {
  return { id, kind: "axis-grid", config };
}

export function scatterLayer(id: string, config?: ScatterChartConfig): FluxionLayerSpec {
  return { id, kind: "scatter", config };
}

export function areaLayer(id: string, config?: AreaChartConfig): FluxionLayerSpec {
  return { id, kind: "area", config };
}

export function stepLayer(id: string, config?: StepChartConfig): FluxionLayerSpec {
  return { id, kind: "step", config };
}

export function barLayer(id: string, config?: BarChartConfig): FluxionLayerSpec {
  return { id, kind: "bar", config };
}

export function candlestickLayer(id: string, config?: CandlestickConfig): FluxionLayerSpec {
  return { id, kind: "candlestick", config };
}

export function heatmapLayer(id: string, config?: HeatmapConfig): FluxionLayerSpec {
  return { id, kind: "heatmap", config };
}
