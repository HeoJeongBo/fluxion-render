import type { LegendItem } from "../ui/fluxion-legend";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

/** Layer kinds excluded from a derived legend (no data series / no color). */
const NON_SERIES_KINDS = new Set(["axis-grid", "reference-line"]);

/**
 * Derive `<FluxionLegend>` items from a `layers` array — one entry per data
 * layer that has a `color`, labeled by the layer `id` (or a `labels` override).
 * Axis-grid and reference-line layers are skipped. Saves hand-maintaining a
 * parallel `items` array alongside `layers`.
 *
 * ```tsx
 * <FluxionLegend items={legendFromLayers(layers, { m0: "Motor 0" })} />
 * ```
 */
export function legendFromLayers(
  layers: FluxionLayerSpec[],
  labels?: Record<string, string>,
): LegendItem[] {
  const items: LegendItem[] = [];
  for (const spec of layers) {
    if (NON_SERIES_KINDS.has(spec.kind)) continue;
    const config = spec.config as { color?: string } | undefined;
    if (!config?.color) continue;
    items.push({ color: config.color, label: labels?.[spec.id] ?? spec.id });
  }
  return items;
}
