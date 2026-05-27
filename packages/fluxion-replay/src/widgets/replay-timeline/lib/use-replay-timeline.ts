import { useCallback, useMemo } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import { detectGaps, type GapInfo } from "../../../features/session/lib/detect-gaps";
import { snapTimeToSegment } from "../../../features/session/lib/snap-time-to-segment";
import type { RecordingSegment } from "../../../features/store/model/replay-store";
import { useReplayPlayer } from "./use-replay-player";

export type { GapInfo };

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
  /** Recording segments (A→B, C→D …). Empty array when no segments are known. */
  segments: readonly RecordingSegment[];
  /** Gaps between segments (B→C …). Derived from `segments`. */
  gaps: readonly GapInfo[];
  /** True when `currentT` falls inside a gap (no recorded data at this time). */
  isInGap: boolean;
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
  segments: readonly RecordingSegment[] = [],
): UseReplayTimelineResult {
  const { currentT, seek } = useReplayPlayer(player);

  const earliest = timeRange?.earliest ?? 0;
  const latest = timeRange?.latest ?? 0;
  const durationMs = Math.max(0, latest - earliest);

  const fraction = durationMs > 0 ? Math.min(1, Math.max(0, (currentT - earliest) / durationMs)) : 0;

  const currentMs = Math.max(0, currentT - earliest);
  const remainingMs = Math.max(0, latest - currentT);
  const percent = durationMs > 0 ? (currentMs / durationMs) * 100 : 0;

  const gaps = useMemo(() => detectGaps(segments, latest), [segments, latest]);

  const isInGap = useMemo(
    () => gaps.some((g) => currentT >= g.start && currentT < g.end),
    [gaps, currentT],
  );

  const seekTo = useCallback(
    (f: number) => {
      if (!timeRange) return;
      const clamped = Math.min(1, Math.max(0, f));
      const raw = timeRange.earliest + clamped * durationMs;
      const snapped = segments.length > 0
        ? snapTimeToSegment(raw, segments, timeRange.latest)
        : raw;
      seek(snapped);
    },
    [seek, timeRange, durationMs, segments],
  );

  const seekToMs = useCallback(
    (t: number) => {
      const snapped = segments.length > 0
        ? snapTimeToSegment(t, segments, latest)
        : t;
      seek(snapped);
    },
    [seek, segments, latest],
  );

  const seekForward = useCallback(
    (ms: number) => {
      const raw = currentT + ms;
      const snapped = segments.length > 0
        ? snapTimeToSegment(raw, segments, latest)
        : raw;
      seek(snapped);
    },
    [seek, currentT, segments, latest],
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
    segments,
    gaps,
    isInGap,
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
