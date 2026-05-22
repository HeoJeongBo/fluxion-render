import { useEffect, useRef, useState } from "react";
import type { ReplaySession } from "../../../features/session/model/replay-session";
import type { StorageInfo } from "../../../features/store/model/replay-store";

export interface UseStorageInfoOptions {
  /** How often to poll in milliseconds. Default: 5000. */
  intervalMs?: number;
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
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session) return;

    const fetch = async () => {
      try {
        const result = await session.getStorageInfo();
        setInfo(result);
      } catch {
        // ignore
      }
    };

    void fetch();
    timerRef.current = setInterval(fetch, intervalMs);

    return () => {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [session, intervalMs]);

  return info;
}
