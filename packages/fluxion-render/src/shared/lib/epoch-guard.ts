/**
 * One-time dev guard against pushing absolute epoch timestamps.
 *
 * Fluxion expects host-relative `t` (ms since the session's `timeOrigin`).
 * Pushing absolute `Date.now()` (~1.7e12 ms) quantizes catastrophically at
 * Float32 precision — adjacent sub-second samples collapse onto one x-pixel.
 * A value past this threshold is almost certainly an absolute epoch mistake.
 */
const ABSOLUTE_EPOCH_THRESHOLD = 1e12;

// Keys (layer ids) already warned about. Per-key rather than a single global
// flag so that, in a multi-chart dashboard, one chart's mistake doesn't consume
// the warning and mask the same bug on a different layer. A shared sentinel key
// is used when no key is supplied.
const warned = new Set<string>();
const NO_KEY = "\0";

/**
 * Warn once per `key` if `t` looks like an absolute epoch timestamp. No-op after
 * the first warning for that key, and for plausible host-relative values. Pass
 * the layer id as `key` so each layer is independently surfaced.
 */
export function warnIfAbsoluteEpoch(t: number, key?: string): void {
  if (t < ABSOLUTE_EPOCH_THRESHOLD) return;
  const k = key ?? NO_KEY;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(
    `[fluxion] A timestamp (${t}) on layer "${key ?? "?"}" looks like an ` +
      "absolute epoch (Date.now()). Push host-relative ms instead " +
      "(Date.now() - timeOrigin); absolute epochs quantize badly at Float32 " +
      "precision and collapse samples onto one pixel.",
  );
}

/** Reset the per-key guard. Test-only. */
export function _resetEpochGuard(): void {
  warned.clear();
}
