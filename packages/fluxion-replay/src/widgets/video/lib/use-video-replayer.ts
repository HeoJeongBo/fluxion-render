import { type RefObject, useEffect, useRef } from "react";
import type { ReplayPlayer } from "../../../features/player/model/replay-player";
import type { ReplayStore } from "../../../features/store/model/replay-store";
import { VideoReplayer, type VideoDecoderConfig } from "../../../features/video/model/video-replayer";

export interface UseVideoReplayerOptions {
  decoderConfig?: VideoDecoderConfig;
}

/**
 * Wires a `VideoReplayer` to a `ReplayPlayer` for the given canvas and channel.
 * Creates a new replayer whenever `player` changes and disposes the old one.
 *
 * @example
 * useVideoReplayer(player, canvasRef, store, "screen");
 */
export function useVideoReplayer(
  player: ReplayPlayer | null,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  store: ReplayStore | null,
  channelId: string,
  options?: UseVideoReplayerOptions,
): void {
  const replayerRef = useRef<VideoReplayer | null>(null);

  useEffect(() => {
    replayerRef.current?.dispose();
    replayerRef.current = null;

    if (!player || !canvasRef.current || !store) return;

    const vr = new VideoReplayer({
      channelId,
      store,
      outputCanvas: canvasRef.current,
      decoderConfig: options?.decoderConfig,
    });
    replayerRef.current = vr;

    const off = player.onFrame((frame) => {
      if (frame.channelId === channelId) {
        vr.feedFrame(frame);
      }
    });

    return () => {
      off();
      vr.dispose();
      replayerRef.current = null;
    };
  // canvasRef: ref 객체 자체가 아닌 .current 값을 사용하므로 의도적으로 제외 — player 교체 시 effect가 재실행되어 최신 canvas를 반영함
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, channelId, store]);
}
