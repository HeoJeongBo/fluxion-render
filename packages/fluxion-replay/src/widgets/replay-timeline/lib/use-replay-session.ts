import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import { ReplaySession, type ReplaySessionMode, type ReplaySessionOptions } from "../../../features/session/model/replay-session";

export interface UseReplaySessionOptions extends ReplaySessionOptions {
  autoOpen?: boolean;
}

export interface UseReplaySessionResult {
  session: ReplaySession | null;
  isReady: boolean;
  mode: ReplaySessionMode;
  timeRange: { earliest: number; latest: number } | null;
  record: <T>(channelId: string, data: T, t?: number) => void;
  enterReplay: (
    t?: number,
    opts?: { timeRange?: { earliest: number; latest: number } },
  ) => Promise<ReplayPlayer | null>;
  exitReplay: () => void;
}

export function useReplaySession(opts: UseReplaySessionOptions): UseReplaySessionResult {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [session, setSession] = useState<ReplaySession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [mode, setMode] = useState<ReplaySessionMode>("live");
  const [timeRange, setTimeRange] = useState<{ earliest: number; latest: number } | null>(null);

  useEffect(() => {
    const { autoOpen = true, ...sessionOpts } = optsRef.current;
    const s = new ReplaySession(sessionOpts);
    setSession(s);

    if (autoOpen) {
      s.open().then(() => setIsReady(true)).catch(console.error);
    }

    return () => {
      s.dispose();
      setSession(null);
      setIsReady(false);
    };
  }, []);

  const record = useCallback(<T>(channelId: string, data: T, t?: number) => {
    session?.record(channelId, data, t);
  }, [session]);

  const enterReplay = useCallback(
    async (
      t?: number,
      opts?: { timeRange?: { earliest: number; latest: number } },
    ): Promise<ReplayPlayer | null> => {
      if (!session) return null;
      const player = await session.enterReplay(t, opts);
      setMode("replay");

      const range = await session.getTimeRange();
      setTimeRange(range);

      return player;
    },
    [session],
  );

  const exitReplay = useCallback(() => {
    session?.exitReplay();
    setMode("live");
  }, [session]);

  return { session, isReady, mode, timeRange, record, enterReplay, exitReplay };
}
