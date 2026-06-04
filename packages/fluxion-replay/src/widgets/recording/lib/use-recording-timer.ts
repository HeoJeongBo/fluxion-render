import { useEffect, useState } from "react";

export interface UseRecordingTimerOptions {
  /**
   * Whether recording is currently active. The timer starts (or restarts from
   * zero) on every `false → true` transition and stops on `true → false`.
   */
  isRecording: boolean;
}

export interface UseRecordingTimerResult {
  /**
   * Whole seconds elapsed since the current recording started. Resets to `0`
   * whenever `isRecording` becomes `false` or a new recording starts.
   */
  elapsedSec: number;
}

/**
 * Tracks how long the current recording has been running in whole seconds.
 *
 * @example
 * const { isRecording } = useRecordingSession({ session, enabled: isReady });
 * const { elapsedSec } = useRecordingTimer({ isRecording });
 *
 * <span>{Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, "0")}</span>
 */
export function useRecordingTimer(opts: UseRecordingTimerOptions): UseRecordingTimerResult {
  const { isRecording } = opts;
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setElapsedSec(0);
      return;
    }

    const startMs = Date.now();
    setElapsedSec(0);

    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);

    return () => clearInterval(id);
  }, [isRecording]);

  return { elapsedSec };
}
