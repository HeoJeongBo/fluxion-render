import { useEffect, useRef, useState } from "react";
import type {
  ReplayPlayer,
  ReplayPlayerFrame,
} from "../../../features/player/model/replay-player";

export interface UseReplayFrameLogOptions {
  /**
   * Channel ids to drop from the log. The common case is the video channel,
   * whose frames are painted to a canvas by `useVideoReplayer` rather than
   * listed. Default `[]` (keep every frame).
   */
  exclude?: string[];
  /**
   * Maximum number of frames retained (most-recent wins). Older frames fall
   * off the front. Default `100`.
   */
  max?: number;
}

const DEFAULT_MAX = 100;

/**
 * Collects a `ReplayPlayer`'s frames into a bounded, most-recent-first-friendly
 * array for display — the `onFrame` → filter-out-video → `slice(-N)` pattern the
 * DVR demos kept hand-rolling. Excludes `exclude` channels, keeps the last `max`
 * frames, resets when `player` changes or goes null, and unsubscribes on unmount.
 *
 * @example
 * const logs = useReplayFrameLog(player, { exclude: [VIDEO_CHANNEL_ID] });
 * // render logs (e.g. [...logs].reverse() for newest-first)
 */
export function useReplayFrameLog(
  player: ReplayPlayer | null,
  opts?: UseReplayFrameLogOptions,
): ReplayPlayerFrame[] {
  const max = opts?.max ?? DEFAULT_MAX;
  // Read filter options through refs so changing them doesn't tear down the
  // subscription (and lose the accumulated log).
  const excludeRef = useRef(opts?.exclude);
  excludeRef.current = opts?.exclude;
  const maxRef = useRef(max);
  maxRef.current = max;

  const [frames, setFrames] = useState<ReplayPlayerFrame[]>([]);

  useEffect(() => {
    setFrames([]);
    if (!player) return;

    return player.onFrame((frame) => {
      if (excludeRef.current?.includes(frame.channelId)) return;
      setFrames((prev) => {
        const next = prev.concat(frame);
        return next.length > maxRef.current
          ? next.slice(next.length - maxRef.current)
          : next;
      });
    });
  }, [player]);

  return frames;
}
