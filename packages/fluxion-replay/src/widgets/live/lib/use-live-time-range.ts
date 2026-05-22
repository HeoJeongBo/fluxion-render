import { useEffect, useRef, useState } from "react";
import type { ReplaySession } from "../../../features/session/model/replay-session";

export interface UseLiveTimeRangeOptions {
  /** How often to poll for the latest time range in milliseconds. Default: 500. */
  intervalMs?: number;
}

export interface UseLiveTimeRangeResult {
  timeRange: { earliest: number; latest: number } | null;
  /** Call this to immediately seed the timeRange without waiting for the next poll. */
  seed: (range: { earliest: number; latest: number }) => void;
}

/**
 * Polls `session.getTimeRange()` on a fixed interval and returns the latest
 * known time range. Useful for keeping a live scrubber in sync while recording.
 *
 * @example
 * const { timeRange, seed } = useLiveTimeRange(session);
 * // On recording start, seed immediately so the scrubber is enabled at once:
 * const now = Date.now();
 * seed({ earliest: now, latest: now });
 */
export function useLiveTimeRange(
  session: ReplaySession | null,
  options?: UseLiveTimeRangeOptions,
): UseLiveTimeRangeResult {
  const intervalMs = options?.intervalMs ?? 500;
  const [timeRange, setTimeRange] = useState<{ earliest: number; latest: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    const poll = async () => {
      try {
        const range = await session.getTimeRange();
        if (range) setTimeRange(range);
      } catch {
        // Store may not be open yet — ignore
      }
    };

    void poll();
    timerRef.current = setInterval(poll, intervalMs);

    return () => {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [session, intervalMs]);

  const seed = (range: { earliest: number; latest: number }) => setTimeRange(range);

  return { timeRange, seed };
}
