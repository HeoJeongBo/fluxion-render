import { useCallback, useRef, useState } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";

export interface UsePlaybackRateOptions {
  /** The active DVR player, or `null` in live mode. */
  player: ReplayPlayer | null;
  /** Initial playback rate. Default `1`. */
  initialRate?: number;
}

export interface UsePlaybackRateResult {
  /** Current playback rate. */
  rate: number;
  /**
   * Update the rate. If the player is currently playing, `player.play(r)` is
   * called immediately so the change takes effect without an extra click.
   *
   * @example
   * const { rate, setRate } = usePlaybackRate({ player: dvr.player });
   * // In a rate button's onClick:
   * setRate(2);  // switches to 2× whether playing or paused
   */
  setRate: (r: number) => void;
}

/**
 * Manages playback rate for a DVR player. Calling `setRate(r)` updates the
 * stored rate and — if the player is currently playing — immediately applies
 * it via `player.play(r)` so the change takes effect without an extra click.
 *
 * @example
 * const { rate, setRate } = usePlaybackRate({ player: dvr.player });
 *
 * {([0.5, 1, 2, 4] as const).map((r) => (
 *   <button key={r} onClick={() => setRate(r)}>{r}×</button>
 * ))}
 */
export function usePlaybackRate(opts: UsePlaybackRateOptions): UsePlaybackRateResult {
  const { player, initialRate = 1 } = opts;

  const [rate, setRateState] = useState(initialRate);

  // Keep player in a ref so setRate's useCallback identity is stable even
  // when the player reference changes (e.g. on DVR enter/exit cycles).
  const playerRef = useRef(player);
  playerRef.current = player;

  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (playerRef.current?.state === "playing") {
      playerRef.current.play(r);
    }
  }, []);

  return { rate, setRate };
}
