import { useCallback, useEffect, useRef, useState } from "react";
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
   * Pointer-down handler for `<input type="range">`. Wire to `onPointerDown`
   * (and/or `onMouseDown`/`onTouchStart`). Resets the per-gesture entry guard at
   * the start of each drag so a previous gesture whose release was lost can't
   * permanently block live→DVR entry. Recommended for robustness; without it the
   * guard only resets on `commitScrub`.
   */
  beginScrub: () => void;
  /**
   * `onChange` handler for `<input type="range">`. Call on every drag event.
   * In live mode it enters DVR exactly ONCE per drag — the first time the user
   * drags past the live edge — entering paused so the chart previews the past
   * frame at the drag position. Every subsequent drag tick seeks synchronously,
   * updating the preview without re-entering. Resumes playback on commit.
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

  // True once THIS drag gesture has initiated a live→DVR enter. Gates entry to
  // exactly ONE enter() per drag — a SYNCHRONOUS gate, unlike `dvr.isDvr` which
  // only flips after the async setPlayer lands. Without it a synchronous burst
  // of onChange events would fire N concurrent enters that race the commit
  // enter (the flaky-entry bug). Reset at commit (gesture end).
  const enteredDuringDragRef = useRef(false);

  // Reset the per-gesture entry flag at the START of every drag. The flag is
  // otherwise only cleared in commitScrub, so a gesture whose release was lost
  // (pointer-up off the input/window, or the handler swapped out mid-gesture)
  // leaves it stuck `true` — after which EVERY future live→DVR drag is silently
  // gated out (`!enteredDuringDragRef.current` is false) and the scrubber thumb
  // just springs back to live. pointerdown fires reliably at the start of each
  // drag, so it un-wedges the flag. Wire to the scrubber input's onPointerDown.
  const beginScrub = useCallback(() => {
    enteredDuringDragRef.current = false;
  }, []);

  // Coalesce drag-time seeks to ONE per animation frame. A mousemove fires
  // onChange ~60×/s; each seek triggers a full chart hydrate (IDB query +
  // decode), which at 500 Hz is hundreds of ms — so seeking on every tick makes
  // scrubbing janky. We keep only the latest target and seek once per frame.
  // No data is dropped: the chart still lands on every settled position; only
  // redundant intra-frame seeks are skipped.
  const pendingSeekRef = useRef<{ t: number; raf: number } | null>(null);

  const flushPendingSeek = useCallback(() => {
    const pending = pendingSeekRef.current;
    if (!pending) return;
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(pending.raf);
    pendingSeekRef.current = null;
  }, []);

  const scheduleSeek = useCallback(
    (t: number) => {
      // requestAnimationFrame may be absent (SSR/tests) — seek immediately then.
      if (typeof requestAnimationFrame === "undefined") {
        dvr.player?.seek(t);
        return;
      }
      if (pendingSeekRef.current) {
        // Same frame already scheduled → just update the target.
        pendingSeekRef.current.t = t;
        return;
      }
      const raf = requestAnimationFrame(() => {
        const target = pendingSeekRef.current?.t ?? t;
        pendingSeekRef.current = null;
        dvr.player?.seek(target);
      });
      pendingSeekRef.current = { t, raf };
    },
    [dvr],
  );

  const onScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const range = dvr.effectiveTimeRange;
      if (!range) return;
      const t = Number(e.target.value);
      setScrubT(t);

      if (dvr.isDvr) {
        // Already in DVR — preview the past at the drag position, coalesced to
        // one seek per animation frame so a fast drag doesn't fire a hydrate
        // (IDB query + decode) on every mousemove.
        scheduleSeek(t);
        return;
      }

      // Live mode: enter DVR EXACTLY ONCE per drag, the first time the user
      // drags meaningfully past the live edge — so the UI switches to DVR and
      // the chart previews mid-drag. The flag (not dvr.isDvr, which flips only
      // after the async setPlayer) gates the synchronous burst to one enter.
      if (!enteredDuringDragRef.current && t < range.latest - liveEdgeEpsMs) {
        enteredDuringDragRef.current = true;
        void dvr.enter(t).then((p) => {
          if (p) {
            // Preview is driven by seek→onSeek→hydrate; we do NOT want playback
            // while the user is still dragging. Force paused regardless of the
            // DVR hook's autoPlay option (which this hook can't see). pause()
            // is a no-op when already idle.
            p.pause();
          } else {
            // enter() no-oped / lost a race — re-arm so a later tick can retry.
            enteredDuringDragRef.current = false;
          }
        });
      }
      // After isDvr flips, subsequent ticks hit the seek branch above — preview
      // continues with no further enter.
    },
    [dvr, liveEdgeEpsMs, scheduleSeek],
  );

  const commitScrub = useCallback(() => {
    const t = scrubT;
    const range = dvr.effectiveTimeRange;
    setScrubT(null);
    // Cancel any frame-coalesced seek — the release seeks to the exact final t.
    flushPendingSeek();
    // End of gesture → re-arm for the next drag.
    const enteredThisDrag = enteredDuringDragRef.current;
    enteredDuringDragRef.current = false;
    if (t == null || !range) return;

    if (!dvr.isDvr) {
      // Live mode AND this drag never entered DVR (e.g. a quick click without a
      // past-edge drag, or the single drag-enter hasn't resolved yet). Only
      // commit-enter when we didn't already start one during the drag — firing
      // a second enter here would race the in-flight one (re-introducing the
      // flaky-entry bug). Play the RETURNED player, not `dvr.player` (still null
      // in this closure until the async setPlayer lands).
      if (!enteredThisDrag && t < range.latest - liveEdgeEpsMs) {
        void dvr.enter(t).then((p) => p?.play(rateRef.current));
      }
    } else if (t >= (dvr.frozenLatest ?? range.latest) - liveEdgeEpsMs) {
      // Pulled back to the live edge → exit DVR.
      dvr.exit();
    } else {
      // Mid-DVR seek: snap to the released position and resume playback.
      dvr.player?.seek(t);
      dvr.player?.play(rateRef.current);
    }
  }, [dvr, scrubT, liveEdgeEpsMs, flushPendingSeek]);

  // Cancel any in-flight coalesced seek on unmount.
  useEffect(() => () => flushPendingSeek(), [flushPendingSeek]);

  return { scrubT, beginScrub, onScrubChange, commitScrub };
}
