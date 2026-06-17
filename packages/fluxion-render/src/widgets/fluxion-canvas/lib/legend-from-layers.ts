import type { LegendItem } from "../ui/fluxion-legend";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

/** Layer kinds excluded from a derived legend (no data series / no color). */
const NON_SERIES_KINDS = new Set(["axis-grid", "reference-line"]);

/**
 * Derive `<FluxionLegend>` items from a `layers` array — one entry per data
 * layer that has a `color`, labeled by its `config.label` (falling back to the
 * layer `id`). Axis-grid and reference-line layers are skipped. Saves
 * hand-maintaining a parallel `items` array alongside `layers`.
 *
 * ```tsx
 * <FluxionLegend items={legendFromLayers(layers)} />
 * ```
 */
export function legendFromLayers(layers: FluxionLayerSpec[]): LegendItem[] {
  const items: LegendItem[] = [];
  for (const spec of layers) {
    if (NON_SERIES_KINDS.has(spec.kind)) continue;
    const config = spec.config as { color?: string; label?: string } | undefined;
    if (!config?.color) continue;
    items.push({ color: config.color, label: config.label ?? spec.id });
  }
  return items;
}
