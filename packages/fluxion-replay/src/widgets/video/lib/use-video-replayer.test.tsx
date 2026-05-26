import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayPlayer } from "../../../features/player/model/replay-player";
import { ReplayStore } from "../../../features/store/model/replay-store";
import { VideoReplayer } from "../../../features/video/model/video-replayer";
import { useVideoReplayer } from "./use-video-replayer";

function makeStore() {
  return new ReplayStore({ batchIntervalMs: 9999 });
}

function makePlayer(store: ReplayStore) {
  return new ReplayPlayer({
    store,
    channels: new Map(),
    timeRange: { earliest: 0, latest: 10_000 },
  });
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  return canvas;
}

describe("useVideoReplayer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not crash when player is null", () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    const store = makeStore();
    expect(() => {
      renderHook(() => useVideoReplayer(null, canvasRef, store, "screen"));
    }).not.toThrow();
  });

  it("creates a VideoReplayer when player and canvas are provided", () => {
    const constructorSpy = vi.spyOn(VideoReplayer.prototype, "feedFrame").mockImplementation(() => {});
    const disposeSpy = vi.spyOn(VideoReplayer.prototype, "dispose").mockImplementation(() => {});

    const store = makeStore();
    const player = makePlayer(store);
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };

    const { unmount } = renderHook(() =>
      useVideoReplayer(player, canvasRef, store, "screen"),
    );

    unmount();
    expect(disposeSpy).toHaveBeenCalled();

    player.dispose();
    constructorSpy.mockRestore();
    disposeSpy.mockRestore();
  });

  it("disposes previous VideoReplayer when player changes", () => {
    const disposeSpy = vi.spyOn(VideoReplayer.prototype, "dispose").mockImplementation(() => {});

    const store = makeStore();
    const player1 = makePlayer(store);
    const player2 = makePlayer(store);
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };

    let currentPlayer = player1;
    const { rerender } = renderHook(() =>
      useVideoReplayer(currentPlayer, canvasRef, store, "screen"),
    );

    currentPlayer = player2;
    rerender();

    // Disposed once for player1's replayer
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    currentPlayer = player2;
    renderHook(() => useVideoReplayer(null, canvasRef, store, "screen"));

    player1.dispose();
    player2.dispose();
    disposeSpy.mockRestore();
  });

  it("does not create VideoReplayer when canvas ref is null", () => {
    const store = makeStore();
    const player = makePlayer(store);
    const canvasRef = { current: null };

    // Should not throw
    expect(() => {
      renderHook(() => useVideoReplayer(player, canvasRef, store, "screen"));
    }).not.toThrow();

    player.dispose();
  });

  it("feedFrame is called when player emits a frame with matching channelId (lines 41-42)", () => {
    const feedSpy = vi.spyOn(VideoReplayer.prototype, "feedFrame").mockImplementation(() => {});

    const store = makeStore();
    const canvas = makeCanvas();
    const canvasRef = { current: canvas };

    // Use a simple fake player that lets us emit frames directly
    const listeners: ((f: unknown) => void)[] = [];
    const fakePlayer = {
      onFrame: (l: (f: unknown) => void) => {
        listeners.push(l);
        return () => { const i = listeners.indexOf(l); if (i !== -1) listeners.splice(i, 1); };
      },
    } as unknown as import("../../../features/player/model/replay-player").ReplayPlayer;

    renderHook(() => useVideoReplayer(fakePlayer, canvasRef, store, "screen"));

    // Emit a frame with the MATCHING channelId → feedFrame should be called (lines 41-42)
    act(() => {
      for (const l of listeners) l({ channelId: "screen", t: 100 });
    });
    expect(feedSpy).toHaveBeenCalledTimes(1);

    // Emit a frame with a NON-matching channelId → feedFrame should NOT be called
    act(() => {
      for (const l of listeners) l({ channelId: "camera", t: 200 });
    });
    expect(feedSpy).toHaveBeenCalledTimes(1); // still 1, not 2

    feedSpy.mockRestore();
  });
});
