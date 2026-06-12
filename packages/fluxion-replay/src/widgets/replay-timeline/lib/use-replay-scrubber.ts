import { useMemo } from "react";

export interface UseReplayScrubberOptions {
  /**
   * Active visible time range. In chart-replay this is `dvr.effectiveTimeRange`
   * — live mode echoes `liveTimeRange`, DVR mode swaps the right edge for the
   * frozen latest. `null` collapses the bar to a disabled state.
   */
  effectiveTimeRange: { earliest: number; latest: number } | null;
  /**
   * Live edge — used to resolve the cursor value in live mode (no DVR player
   * yet). `null` falls back to `effectiveTimeRange.latest`.
   */
  liveTimeRange: { earliest: number; latest: number } | null;
  /** True while a `ReplayPlayer` is active (chart-replay's `dvr.isDvr`). */
  isDvr: boolean;
  /**
   * DVR cursor — already snapped via `useReplayPlayer` (1-second boundary).
   * Ignored in live mode.
   */
  replayPlayerT: number;
  /**
   * Drag-preview value. `null` when the user isn't dragging. While
   * non-null, this overrides the otherwise-resolved cursor so the thumb
   * tracks the user's drag finger pixel-for-pixel — then snapped here.
   */
  scrubT: number | null;
  /**
   * Fixed anchor for the bar's LEFT edge. When provided, the bar's min is
   * derived from this value (snapped, then widened to `minSpanMs`) instead
   * of from `effectiveTimeRange.earliest`. Use the recording-start wall
   * clock so the left edge stays put across DVR entries/exits and through
   * retention-driven `earliest` movement.
   *
   * Without this, the left edge tracks `liveTimeRange.earliest`, which
   * advances when old frames evict from the store — the user reads that as
   * "bar is moving" or "the scrubber lost the recording start".
   */
  recordingStartMs?: number;
  /**
   * Minimum bar width. Default 60_000ms. Without this, a freshly seeded
   * `liveTimeRange = { now, now }` would render as a degenerate
   * `<input min=X max=X>` until polling fills it out — the user reads that
   * as "the bar is empty". Floor it so the bar is always a meaningful width.
   */
  minSpanMs?: number;
  /**
   * Snap quantum applied to every returned value. Default 1_000ms. Matches
   * `useReplayPlayer`'s cursor snap so the entire scrubber UI updates in
   * lock-step at 1 Hz.
   */
  snapMs?: number;
}

export interface UseReplayScrubberResult {
  /** Snapped left edge (≤ max). */
  min: number;
  /** Snapped right edge. */
  max: number;
  /** Snapped cursor / current value. */
  value: number;
  /**
   * `true` when min === max — the consumer should render the input as
   * `disabled` (or non-interactive) since dragging within a zero-width
   * range is meaningless.
   */
  disabled: boolean;
}

const DEFAULT_MIN_SPAN_MS = 60_000;
const DEFAULT_SNAP_MS = 1_000;

/**
 * Derive scrubber `min` / `max` / `value` snapped to 1-second boundaries with
 * a guaranteed minimum bar width. Encapsulates the time-axis bookkeeping the
 * chart-replay demo previously inlined so the demo stays a pure consumer.
 *
 * @example
 * const { min, max, value, disabled } = useReplayScrubber({
 *   effectiveTimeRange: dvr.effectiveTimeRange,
 *   liveTimeRange,
 *   isDvr: dvr.isDvr,
 *   replayPlayerT: replayPlayer.currentT,
 *   scrubT,
 * });
 * <input type="range" min={min} max={max} value={value} step={1000}
 *        disabled={disabled} ... />
 */
export function useReplayScrubber(
  opts: UseReplayScrubberOptions,
): UseReplayScrubberResult {
  const {
    effectiveTimeRange,
    liveTimeRange,
    isDvr,
    replayPlayerT,
    scrubT,
    recordingStartMs,
    minSpanMs = DEFAULT_MIN_SPAN_MS,
    snapMs = DEFAULT_SNAP_MS,
  } = opts;

  return useMemo(() => {
    const snap = (t: number) => Math.floor(t / snapMs) * snapMs;

    if (!effectiveTimeRange) {
      return { min: 0, max: 0, value: 0, disabled: true };
    }
    const rawMax = effectiveTimeRange.latest;
    const max = snap(rawMax);
    // Left edge:
    //   * When `recordingStartMs` is supplied, use it ABSOLUTELY — no
    //     `minSpanMs` widening. The earlier formula's `Math.min(recording,
    //     rawMax - minSpan)` defeated the whole point of pinning, because
    //     for the first `minSpanMs` of the recording `rawMax - minSpan` is
    //     always smaller than `recording` and slid forward by one second per
    //     wall second. With this guard the anchor stays put.
    //   * Without `recordingStartMs`, fall back to the live earliest and
    //     widen to `minSpanMs` so a freshly seeded `{ now, now }` range
    //     doesn't render as an empty bar.
    const min = snap(
      recordingStartMs !== undefined
        ? recordingStartMs
        : Math.min(effectiveTimeRange.earliest, rawMax - minSpanMs),
    );
    const resolved =
      scrubT ?? (isDvr ? replayPlayerT : (liveTimeRange?.latest ?? rawMax));
    const value = snap(resolved);
    return { min, max, value, disabled: max <= min };
  }, [
    effectiveTimeRange,
    liveTimeRange,
    isDvr,
    replayPlayerT,
    scrubT,
    recordingStartMs,
    minSpanMs,
    snapMs,
  ]);
}
