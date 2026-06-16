import { getAxisSpec } from "../../../shared/lib/get-axis-spec";
import type { FluxionLayerSpec } from "../../../widgets/fluxion-canvas/lib/use-fluxion-canvas";
import type { FluxionHost } from "../../host";
import type { HoverDataCache } from "./hover-data-cache";
import {
  type UseFluxionCrosshairResult,
  useFluxionCrosshair,
} from "./use-fluxion-crosshair";

export interface UseFluxionCrosshairFromLayersOptions {
  host: FluxionHost | null;
  cache: HoverDataCache;
  /** The same `layers` array passed to `<FluxionCanvas>`. */
  layers: FluxionLayerSpec[];
  /** Axis layer id to read time-window config from. Default `"axis"`. */
  axisLayerId?: string;
  /** Vertical inset matching the axis layer's `yPadPx`. */
  yPadPx?: number;
  xFormat?: (t: number) => string;
  yFormat?: (y: number) => string;
}

/**
 * Convenience wrapper over {@link useFluxionCrosshair} that reads `xMode`,
 * `timeWindowMs`, `timeOrigin`, and `xRange` from the axis-grid layer spec in
 * `layers` — so you configure the time window in exactly one place (the axis
 * layer) instead of re-passing it to the crosshair. Falls back to sensible
 * defaults if no matching axis spec is found.
 */
export function useFluxionCrosshairFromLayers(
  opts: UseFluxionCrosshairFromLayersOptions,
): UseFluxionCrosshairResult {
  const { host, cache, layers, axisLayerId = "axis", yPadPx, xFormat, yFormat } = opts;
  const axisConfig = getAxisSpec(layers, axisLayerId)?.config;

  return useFluxionCrosshair({
    host,
    cache,
    xMode: axisConfig?.xMode ?? "fixed",
    timeWindowMs: axisConfig?.timeWindowMs,
    timeOrigin: axisConfig?.timeOrigin,
    xRange: axisConfig?.xRange,
    yPadPx: yPadPx ?? axisConfig?.yPadPx,
    xFormat,
    yFormat,
  });
}
