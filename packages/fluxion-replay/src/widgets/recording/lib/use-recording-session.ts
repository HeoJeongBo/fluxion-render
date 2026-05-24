import { useEffect, useRef, useState } from "react";
import type { ReplaySession } from "../../../features/session/model/replay-session";

export interface RecordingTickerSpec {
  /** Channel id to record into. Must be registered on the session. */
  channelId: string;
  /** Tick period in ms. */
  intervalMs: number;
  /** Called every tick; the returned value is passed straight to
   *  `session.record(channelId, value, wallT)`. */
  produce: (wallT: number) => unknown;
}

export interface UseRecordingSessionOptions {
  /** Session from `useReplaySession`. Recording stays idle while `null`. */
  session: ReplaySession | null;
  /** Set to `false` to suspend recording (e.g. a "pause" toggle in the UI). */
  enabled: boolean;
  /**
   * Wipe the store before starting (`session.clearRecording()`). Default
   * `true` for "the demo IS the recording" pages; set `false` to keep
   * historical data across remounts.
   */
  clearOnStart?: boolean;
  /**
   * Optional convenience: a list of per-channel tickers. The hook spins
   * up a `setInterval` per spec and stops them on cleanup. Use this for
   * the common "synthesise a sample at N Hz" pattern; for anything more
   * elaborate (random jitter, conditional emission, …) call
   * `session.record()` yourself.
   */
  channels?: readonly RecordingTickerSpec[];
  /**
   * Optional seed for the live time range so a scrubber bar can render
   * immediately without waiting for the first poll. Pass
   * `useLiveTimeRange(session).seed`.
   */
  seedTimeRange?: (range: { earliest: number; latest: number }) => void;
}

export interface UseRecordingSessionResult {
  /** Surfaces `startRecording()` / `clearRecording()` failures. */
  error: Error | null;
  /** `true` from the moment `startRecording()` resolved until cleanup. */
  isRecording: boolean;
}

/**
 * Bundles the recording start/stop dance + optional per-channel tickers
 * the demos write by hand. Captures the StrictMode-safe ref guard so a
 * second mount can't double-start the recorder, and the cancellation
 * flag so a fast unmount doesn't race the async `startRecording()`.
 *
 * @example
 * useRecordingSession({
 *   session,
 *   enabled: isReady,
 *   seedTimeRange,
 *   channels: [
 *     { channelId: "cpu", intervalMs: 200, produce: () => ({ name: "cpu", value: Math.random() }) },
 *     { channelId: "events", intervalMs: 2000, produce: () => ({ level: "info", message: "tick" }) },
 *   ],
 * });
 */
export function useRecordingSession(
  opts: UseRecordingSessionOptions,
): UseRecordingSessionResult {
  const { session, enabled, clearOnStart = true, channels, seedTimeRange } = opts;
  const [error, setError] = useState<Error | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Refs let us read the latest tick produce / seed without re-running
  // the effect, and gate against StrictMode's "mount, cleanup, mount"
  // double-fire.
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const seedRef = useRef(seedTimeRange);
  seedRef.current = seedTimeRange;
  const startedSessionRef = useRef<ReplaySession | null>(null);

  useEffect(() => {
    if (!session || !enabled) return;
    // Same session, already initialised by a previous (StrictMode) mount
    // — don't restart, just no-op.
    if (startedSessionRef.current === session) return;
    startedSessionRef.current = session;

    let cancelled = false;
    const intervalIds: ReturnType<typeof setInterval>[] = [];

    setError(null);

    void (async () => {
      try {
        if (clearOnStart) await session.clearRecording();
        if (cancelled) return;
        await session.startRecording();
        if (cancelled) return;

        if (seedRef.current) {
          const now = Date.now();
          seedRef.current({ earliest: now, latest: now });
        }

        const specs = channelsRef.current ?? [];
        for (const spec of specs) {
          intervalIds.push(
            setInterval(() => {
              const wallT = Date.now();
              session.record(spec.channelId, spec.produce(wallT), wallT);
            }, spec.intervalMs),
          );
        }
        setIsRecording(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          // Allow a retry on next render after a failure.
          startedSessionRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const id of intervalIds) clearInterval(id);
      setIsRecording(false);
      // We deliberately do NOT call session.stopRecording() here: in
      // StrictMode this cleanup fires immediately after the first mount,
      // and stopping would terminate the recorder mid-init. The session's
      // own dispose() — owned by useReplaySession — handles teardown.
    };
  }, [session, enabled, clearOnStart]);

  return { error, isRecording };
}
