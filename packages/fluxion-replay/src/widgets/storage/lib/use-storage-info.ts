import { useEffect, useRef, useState } from "react";
import type { ReplaySession } from "../../../features/session/model/replay-session";
import type { StorageInfo } from "../../../features/store/model/replay-store";

export interface UseStorageInfoOptions {
  /** How often to poll in milliseconds. Default: 5000. */
  intervalMs?: number;
  /**
   * When true, logs storage usage to `console.log` after each successful
   * fetch. Default: false.
   */
  logToConsole?: boolean;
}

/**
 * Periodically fetches storage quota and usage from the session.
 * Returns `null` until the first successful fetch.
 *
 * @example
 * const info = useStorageInfo(session);
 * // info?.percentUsed → 12.4
 * // info?.idbFrameCount → 8320
 */
export function useStorageInfo(
  session: ReplaySession | null,
  options?: UseStorageInfoOptions,
): StorageInfo | null {
  const intervalMs = options?.intervalMs ?? 5_000;
  const logToConsole = options?.logToConsole ?? false;
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    const fetch = async () => {
      try {
        const result = await session.getStorageInfo();
        setInfo(result);
        if (logToConsole) {
          console.log(
            `[useStorageInfo] ${result.percentUsed.toFixed(1)}% used` +
              ` (${(result.usedBytes / 1024 / 1024).toFixed(1)} MB /` +
              ` ${(result.quotaBytes / 1024 / 1024).toFixed(1)} MB),` +
              ` ${result.idbFrameCount} frames`,
          );
        }
      } catch {
        // ignore
      }
    };

    void fetch();
    const timer = setInterval(fetch, intervalMs);
    timerRef.current = timer;

    return () => {
      clearInterval(timer);
      timerRef.current = null;
    };
  }, [session, intervalMs]);

  return info;
}
