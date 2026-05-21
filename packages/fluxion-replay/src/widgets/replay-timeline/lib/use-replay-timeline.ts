import { useCallback } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import { useReplayPlayer } from "./use-replay-player";

export interface BufferedRange {
  readonly start: number;
  readonly end: number;
}

export interface UseReplayTimelineResult {
  currentT: number;
  durationMs: number;
  earliest: number;
  latest: number;
  bufferedRanges: BufferedRange[];
  fraction: number;
  seekTo: (fraction: number) => void;
  seekToMs: (t: number) => void;
}

export function useReplayTimeline(
  player: ReplayPlayer | null,
  timeRange: { earliest: number; latest: number } | null,
): UseReplayTimelineResult {
  const { currentT, seek } = useReplayPlayer(player);

  const earliest = timeRange?.earliest ?? 0;
  const latest = timeRange?.latest ?? 0;
  const durationMs = Math.max(0, latest - earliest);

  const fraction = durationMs > 0 ? Math.min(1, Math.max(0, (currentT - earliest) / durationMs)) : 0;

  const seekTo = useCallback(
    (f: number) => {
      if (!timeRange) return;
      const clamped = Math.min(1, Math.max(0, f));
      seek(timeRange.earliest + clamped * durationMs);
    },
    [seek, timeRange, durationMs],
  );

  const seekToMs = useCallback(
    (t: number) => {
      seek(t);
    },
    [seek],
  );

  return {
    currentT,
    durationMs,
    earliest,
    latest,
    bufferedRanges: [],
    fraction,
    seekTo,
    seekToMs,
  };
}
