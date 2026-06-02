import { useCallback, useRef, useState } from "react";
import type { UseReplayDvrResult } from "../../dvr/lib/use-replay-dvr";

export interface UseScrubberControlsOptions {
  /** DVR controller from `useReplayDvr`. */
  dvr: UseReplayDvrResult;
  /**
   * Playback rate passed to `player.play()` when the user commits a scrub in
   * DVR mode or after entering DVR from the live edge. Default `1`.
   */
  rate?: number;
  /**
   * Distance from the live edge (in milliseconds) within which a scrub target
   * is treated as "back to live" rather than a DVR seek. Prevents accidental
   * DVR entry from micro-drags near the right edge. Default `250`.
   */
  liveEdgeEpsMs?: number;
}

export interface UseScrubberControlsResult {
  /**
   * The current drag-preview position in milliseconds, or `null` when the
   * user is not actively dragging. Wire this to `useReplayScrubber`'s
   * `scrubT` option so the scrubber cursor tracks the drag position.
   */
  scrubT: number | null;
  /**
   * `onChange` handler for `<input type="range">`. Call on every drag event.
   * During live mode it speculatively enters DVR; during DVR mode it seeks
   * synchronously so the chart updates as the user drags.
   */
  onScrubChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Commit handler for `<input type="range">`. Call on `onMouseUp`,
   * `onTouchEnd`, and `onKeyUp` to finalise the scrub target:
   *
   * - Live → near live edge: no-op (micro-drag tolerance).
   * - Live → past live edge: enter DVR at `scrubT` then start playing.
   * - DVR → near frozen edge: exit DVR, return to live.
   * - DVR → mid-timeline: seek to `scrubT` and resume playing.
   */
  commitScrub: () => void;
}

/**
 * Encapsulates the "drag preview → release commit" state machine that the
 * replay scrubber uses to coordinate live↔DVR mode transitions.
 *
 * Pair with `useReplayScrubber` (for the scrubber bounds) and
 * `useReplayDvr` (for the underlying mode state).
 *
 * @example
 * const dvr = useReplayDvr({ session, enterReplay, exitReplay, liveTimeRange, rate });
 * const { scrubT, onScrubChange, commitScrub } = useScrubberControls({ dvr, rate });
 * const { min, max, value } = useReplayScrubber({ ..., scrubT });
 *
 * <input
 *   type="range" min={min} max={max} value={value} step={1000}
 *   onChange={onScrubChange}
 *   onMouseUp={commitScrub} onTouchEnd={commitScrub} onKeyUp={commitScrub}
 * />
 */
export function useScrubberControls(
  opts: UseScrubberControlsOptions,
): UseScrubberControlsResult {
  const { dvr, rate = 1, liveEdgeEpsMs = 250 } = opts;

  const [scrubT, setScrubT] = useState<number | null>(null);

  // Keep rate in a ref so commitScrub's useCallback doesn't need to list it
  // as a dep — prevents a new commitScrub identity on every rate change, which
  // would force consumers to re-bind event handlers.
  const rateRef = useRef(rate);
  rateRef.current = rate;

  const onScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const range = dvr.effectiveTimeRange;
      if (!range) return;
      const t = Number(e.target.value);
      setScrubT(t);

      if (dvr.isDvr) {
        // Already in DVR — seek synchronously so the chart updates while dragging.
        dvr.player?.seek(t);
      } else if (t < range.latest - liveEdgeEpsMs) {
        // Live → speculative DVR entry. The async enter() cancellation logic in
        // useReplayDvr handles rapid onChange bursts from the same drag.
        void dvr.enter(t);
      }
      // Within liveEdgeEpsMs of the live edge: stay live, just track scrubT.
    },
    [dvr, liveEdgeEpsMs],
  );

  const commitScrub = useCallback(() => {
    const t = scrubT;
    const range = dvr.effectiveTimeRange;
    setScrubT(null);
    if (t == null || !range) return;

    if (!dvr.isDvr) {
      // Live mode: only commit if the user dragged meaningfully past the live edge.
      if (t < range.latest - liveEdgeEpsMs) {
        void dvr.enter(t).then(() => dvr.player?.play(rateRef.current));
      }
    } else if (t >= (dvr.frozenLatest ?? range.latest) - liveEdgeEpsMs) {
      // Pulled back to the live edge → exit DVR.
      dvr.exit();
    } else {
      // Mid-DVR seek: snap to the released position and resume playback.
      dvr.player?.seek(t);
      dvr.player?.play(rateRef.current);
    }
  }, [dvr, scrubT, liveEdgeEpsMs]);

  return { scrubT, onScrubChange, commitScrub };
}
