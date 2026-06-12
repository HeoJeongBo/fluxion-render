import { useCallback } from "react";
import type { HoverDataCache } from "../../crosshair/model/hover-data-cache";

export interface UseFluxionExportOptions {
  /** The cache to read data from. Typically the same cache used by useFluxionCrosshair. */
  cache: HoverDataCache;
  /** File name prefix for downloads. Default: "fluxion-export". */
  filename?: string;
}

export interface UseFluxionExportResult {
  /**
   * Download all cached layer data (or a single layer) as a CSV file.
   * Columns: timestamp, layer1, layer2, ...
   */
  exportCSV: (layerId?: string) => void;
  /**
   * Download all cached layer data (or a single layer) as a JSON file.
   * Format: `{ layers: [{ id, label, points: [{t, y}] }] }`
   */
  exportJSON: (layerId?: string) => void;
}

function download(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function collectPoints(
  cache: HoverDataCache,
  layerId?: string,
): { id: string; label: string; color: string; points: { t: number; y: number }[] }[] {
  const layers = cache.getLayers();
  const targets = layerId ? layers.filter((l) => l.id === layerId) : layers;

  return targets.map(({ id, label, color }) => {
    // Access the raw ring buffer via the public API: use findNearest across a
    // synthetic sweep. Since HoverDataCache doesn't expose getAll(), we reconstruct
    // by sampling at every stored t. We use the internal iteration trick via
    // getLatestT and repeated findNearest with increasing xMin.
    const points: { t: number; y: number }[] = [];

    // Walk the ring buffer forward using the public findNearest API:
    // start from t=-Infinity and advance xMin to the last found t each step.
    let xMin = -Infinity;
    for (let i = 0; i < 8192; i++) {
      // Use getLatestT as upper bound check — stop when we've collected all.
      const result = cache.findNearest(id, xMin + 1e-9, xMin);
      if (!result) break;
      if (result.t === xMin) break; // No new point found.
      points.push({ t: result.t, y: result.y });
      xMin = result.t;
    }

    return { id, label, color, points };
  });
}

/**
 * Provides CSV and JSON download of cached chart data.
 *
 * Pair with `HoverDataCache` from `useFluxionCrosshair` to export the same
 * data that drives the crosshair tooltip.
 *
 * ```tsx
 * const cache = useMemo(() => new HoverDataCache(), []);
 * const { exportCSV, exportJSON } = useFluxionExport({ cache });
 * ```
 */
export function useFluxionExport(opts: UseFluxionExportOptions): UseFluxionExportResult {
  const { cache, filename = "fluxion-export" } = opts;

  const exportCSV = useCallback(
    (layerId?: string) => {
      const layers = collectPoints(cache, layerId);
      if (layers.length === 0) return;

      // Build a merged time-indexed table.
      const tSet = new Set<number>();
      for (const l of layers) {
        for (const p of l.points) tSet.add(p.t);
      }
      const times = Array.from(tSet).sort((a, b) => a - b);

      // Index each layer's points by t for O(1) lookup.
      const byT = layers.map((l) => {
        const m = new Map<number, number>();
        for (const p of l.points) m.set(p.t, p.y);
        return m;
      });

      const header = ["timestamp_ms", ...layers.map((l) => l.label)].join(",");
      const rows = times.map((t) => {
        const cols = [
          t.toFixed(3),
          ...byT.map((m) => (m.has(t) ? m.get(t)!.toFixed(6) : "")),
        ];
        return cols.join(",");
      });

      download([header, ...rows].join("\n"), `${filename}.csv`, "text/csv");
    },
    [cache, filename],
  );

  const exportJSON = useCallback(
    (layerId?: string) => {
      const layers = collectPoints(cache, layerId);
      const payload = {
        exportedAt: new Date().toISOString(),
        layers: layers.map(({ id, label, points }) => ({ id, label, points })),
      };
      download(JSON.stringify(payload, null, 2), `${filename}.json`, "application/json");
    },
    [cache, filename],
  );

  return { exportCSV, exportJSON };
}
