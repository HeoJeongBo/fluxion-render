/**
 * One-time dev guard against pushing samples whose inner length doesn't match a
 * layer's declared arity — stacked-area `seriesCount`, heatmap-stream `yBins`,
 * or lidar `stride`. A mismatch silently encodes at the wrong stride, so the
 * worker reads garbage and the chart renders nonsense with no error. Surfacing
 * it once per layer turns a baffling debug session into an obvious fix.
 */

// Per-layer-id so one chart's mistake doesn't mask the same bug on another.
const warned = new Set<string>();

/**
 * Warn once per `id` when `actual` differs from the layer's declared `expected`
 * arity. No-op when they match (or after the first warning for that id). `what`
 * names the quantity for the message (e.g. "values per sample").
 */
export function warnArityMismatch(
  id: string,
  expected: number,
  actual: number,
  what: string,
): void {
  if (actual === expected) return;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(
    `[fluxion] Layer "${id}": ${what} is ${actual}, but the layer config ` +
      `declares ${expected}. Mismatched arity encodes at the wrong stride — the ` +
      "worker reads garbage and the chart renders nonsense. Make them match.",
  );
}

/** Reset the per-id guard. Test-only. */
export function _resetArityGuard(): void {
  warned.clear();
}
