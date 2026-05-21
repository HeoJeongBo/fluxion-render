import { useCallback } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import { useReplayPlayer } from "./use-replay-player";

export interface BufferedRange {
  readonly start: number;
  readonly end: number;
}

export interface TimelineProgress {
  readonly currentMs: number;
  readonly durationMs: number;
  readonly remainingMs: number;
  readonly percent: number;
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
  seekForward: (ms: number) => void;
  seekBackward: (ms: number) => void;
  seekToPercent: (percent: number) => void;
  progress: TimelineProgress;
  isAtStart: boolean;
  isAtLiveEdge: boolean;
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

  const currentMs = Math.max(0, currentT - earliest);
  const remainingMs = Math.max(0, latest - currentT);
  const percent = durationMs > 0 ? (currentMs / durationMs) * 100 : 0;

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

  const seekForward = useCallback(
    (ms: number) => {
      seek(currentT + ms);
    },
    [seek, currentT],
  );

  const seekBackward = useCallback(
    (ms: number) => {
      seek(currentT - ms);
    },
    [seek, currentT],
  );

  const seekToPercent = useCallback(
    (p: number) => {
      seekTo(Math.min(100, Math.max(0, p)) / 100);
    },
    [seekTo],
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
    seekForward,
    seekBackward,
    seekToPercent,
    progress: { currentMs, durationMs, remainingMs, percent },
    isAtStart: currentT <= earliest,
    isAtLiveEdge: durationMs === 0 || currentT >= latest,
  };
}
