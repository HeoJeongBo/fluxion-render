import { useCallback, useEffect, useRef, useState } from "react";
import { ReplayPlayer, type ReplayPlayerState } from "../../../features/player/model/replay-player";

export interface UseReplayPlayerResult {
  player: ReplayPlayer | null;
  state: ReplayPlayerState;
  currentT: number;
  play: (rate?: number) => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
}

/**
 * Time-travel cursor resolution. We expose `currentT` rounded down to the
 * nearest second so the scrubber thumb advances in discrete 1-Hz ticks
 * instead of smearing at rAF rate — Phase 14 user requirement. The internal
 * `player.currentT` (and `onTick` callbacks) still fire at rAF rate; only
 * the React-state mirror is snapped.
 */
const CURSOR_SNAP_MS = 1000;
/**
 * Polling interval for the cursor mirror. Phase 15: replaced the rAF-driven
 * `player.onTick` subscription with this interval because the parent
 * component (chart-replay) processes 40 charts × N samples per rAF, which
 * can queue React batches deep enough that the scrubber's `setCurrentT`
 * effectively never flushes. A 250-ms interval is independent of rAF jank
 * and the React render queue, and detects a second boundary cross within
 * ~125 ms on average.
 */
const CURSOR_POLL_MS = 250;

function snapDown(t: number): number {
  return Math.floor(t / CURSOR_SNAP_MS) * CURSOR_SNAP_MS;
}

export function useReplayPlayer(player: ReplayPlayer | null): UseReplayPlayerResult {
  const [state, setState] = useState<ReplayPlayerState>("idle");
  const [currentT, setCurrentT] = useState(0);
  // Tracks the most recent SNAPPED currentT so we only fire setCurrentT when
  // the second boundary actually changes.
  const lastSnappedRef = useRef(0);

  useEffect(() => {
    if (!player) {
      setState("idle");
      setCurrentT(0);
      lastSnappedRef.current = 0;
      return;
    }

    setState(player.state);
    const initialSnapped = snapDown(player.currentT);
    setCurrentT(initialSnapped);
    lastSnappedRef.current = initialSnapped;

    // Poll the player's clock instead of subscribing to `player.onTick`.
    // The subscription approach worked in isolation but in the chart-replay
    // demo (40 charts × 20 Hz of onFrame work per rAF) the React render
    // queue could starve the scrubber's setCurrentT for seconds, producing
    // a "data flows but cursor is stuck" symptom. Polling decouples cursor
    // updates from rAF scheduling.
    const tickInterval = setInterval(() => {
      const snapped = snapDown(player.currentT);
      if (snapped === lastSnappedRef.current) return;
      lastSnappedRef.current = snapped;
      setCurrentT(snapped);
    }, CURSOR_POLL_MS);

    const offState = player.onStateChange((s) => setState(s));

    return () => {
      clearInterval(tickInterval);
      offState();
    };
  }, [player]);

  const play = useCallback((rate?: number) => player?.play(rate), [player]);
  const pause = useCallback(() => player?.pause(), [player]);
  const stop = useCallback(() => player?.stop(), [player]);
  const seek = useCallback((t: number) => {
    if (!player) return;
    player.seek(t);
    // Mirror the seek in React state right away so the timeline scrubber
    // moves even while paused. Snap to the same boundary used by tick
    // updates so a subsequent tick doesn't undo it.
    const snapped = snapDown(t);
    lastSnappedRef.current = snapped;
    setCurrentT(snapped);
  }, [player]);

  return { player, state, currentT, play, pause, stop, seek };
}
