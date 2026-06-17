/**
 * One-time dev guard against pushing absolute epoch timestamps.
 *
 * Fluxion expects host-relative `t` (ms since the session's `timeOrigin`).
 * Pushing absolute `Date.now()` (~1.7e12 ms) quantizes catastrophically at
 * Float32 precision — adjacent sub-second samples collapse onto one x-pixel.
 * A value past this threshold is almost certainly an absolute epoch mistake.
 */
const ABSOLUTE_EPOCH_THRESHOLD = 1e12;

let warned = false;

/**
 * Warn once (per session) if `t` looks like an absolute epoch timestamp.
 * No-op after the first warning, and for plausible host-relative values.
 */
export function warnIfAbsoluteEpoch(t: number): void {
  if (warned || t < ABSOLUTE_EPOCH_THRESHOLD) return;
  warned = true;
  console.warn(
    `[fluxion] A timestamp (${t}) looks like an absolute epoch (Date.now()). ` +
      "Push host-relative ms instead (Date.now() - timeOrigin); absolute epochs " +
      "quantize badly at Float32 precision and collapse samples onto one pixel.",
  );
}

/** Reset the one-time guard. Test-only. */
export function _resetEpochGuard(): void {
  warned = false;
}
