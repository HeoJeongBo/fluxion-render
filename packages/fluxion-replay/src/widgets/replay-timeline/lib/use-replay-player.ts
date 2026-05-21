import { useCallback, useEffect, useRef, useState } from "react";
import { ReplayPlayer, type ReplayPlayerState } from "../../../features/player/model/replay-player";

export interface UseReplayPlayerResult {
  player: ReplayPlayer | null;
  state: ReplayPlayerState;
  currentT: number;
  play: (rate?: number) => void;
  pause: () => void;
  stop: () => void;
  seek: (t: number) => void;
}

const TICK_THROTTLE_MS = 16;

export function useReplayPlayer(player: ReplayPlayer | null): UseReplayPlayerResult {
  const [state, setState] = useState<ReplayPlayerState>("idle");
  const [currentT, setCurrentT] = useState(0);
  const lastTRef = useRef(0);

  useEffect(() => {
    if (!player) {
      setState("idle");
      setCurrentT(0);
      lastTRef.current = 0;
      return;
    }

    setState(player.state);
    setCurrentT(player.currentT);
    lastTRef.current = player.currentT;

    const offTick = player.onTick((t) => {
      if (Math.abs(t - lastTRef.current) < TICK_THROTTLE_MS) return;
      lastTRef.current = t;
      setCurrentT(t);
    });

    const offState = player.onStateChange((s) => setState(s));

    return () => {
      offTick();
      offState();
    };
  }, [player]);

  const play = useCallback((rate?: number) => player?.play(rate), [player]);
  const pause = useCallback(() => player?.pause(), [player]);
  const stop = useCallback(() => player?.stop(), [player]);
  const seek = useCallback((t: number) => {
    if (!player) return;
    player.seek(t);
    // Update currentT immediately so the timeline scrubber moves even while paused
    lastTRef.current = t;
    setCurrentT(t);
  }, [player]);

  return { player, state, currentT, play, pause, stop, seek };
}
