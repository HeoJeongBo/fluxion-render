import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayPlayer } from "../../../features/player/model/replay-player";
import { ReplayStore } from "../../../features/store/model/replay-store";
import { useReplayTimeline } from "./use-replay-timeline";

function makePlayer(earliest = 0, latest = 10_000) {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  return new ReplayPlayer({
    store,
    channels: new Map(),
    timeRange: { earliest, latest },
  });
}

describe("useReplayTimeline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns zeros for null player and null timeRange", () => {
    const { result } = renderHook(() => useReplayTimeline(null, null));
    expect(result.current.fraction).toBe(0);
    expect(result.current.durationMs).toBe(0);
    expect(result.current.earliest).toBe(0);
    expect(result.current.latest).toBe(0);
  });

  it("computes durationMs from timeRange", () => {
    const player = makePlayer(1000, 6000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 1000, latest: 6000 })
    );
    expect(result.current.durationMs).toBe(5000);
    player.dispose();
  });

  it("fraction starts at 0", () => {
    const player = makePlayer(0, 10_000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    expect(result.current.fraction).toBe(0);
    player.dispose();
  });

  it("seekTo(0.5) seeks to midpoint", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekTo(0.5); });
    expect(seekSpy).toHaveBeenCalledWith(5000);
    player.dispose();
  });

  it("seekTo clamps to [0, 1]", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekTo(-0.5); });
    expect(seekSpy).toHaveBeenCalledWith(0);
    act(() => { result.current.seekTo(1.5); });
    expect(seekSpy).toHaveBeenCalledWith(10_000);
    player.dispose();
  });

  it("seekToMs delegates to player.seek", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekToMs(3000); });
    expect(seekSpy).toHaveBeenCalledWith(3000);
    player.dispose();
  });

  it("seekTo is a no-op when timeRange is null", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() => useReplayTimeline(player, null));
    act(() => { result.current.seekTo(0.5); });
    expect(seekSpy).not.toHaveBeenCalled();
    player.dispose();
  });

  it("fraction is 0 when durationMs is 0", () => {
    const player = makePlayer(5000, 5000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 5000, latest: 5000 })
    );
    expect(result.current.fraction).toBe(0);
    player.dispose();
  });

  it("seekForward advances seek by ms", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekForward(2000); });
    // currentT starts at 0, so seek(0 + 2000)
    expect(seekSpy).toHaveBeenCalledWith(2000);
    player.dispose();
  });

  it("seekBackward retreats seek by ms", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekBackward(1000); });
    // currentT starts at 0, seek(0 - 1000) = -1000 (clamped by player internally)
    expect(seekSpy).toHaveBeenCalledWith(-1000);
    player.dispose();
  });

  it("seekToPercent(50) seeks to midpoint", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekToPercent(50); });
    expect(seekSpy).toHaveBeenCalledWith(5000);
    player.dispose();
  });

  it("seekToPercent clamps to [0, 100]", () => {
    const player = makePlayer(0, 10_000);
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    act(() => { result.current.seekToPercent(-10); });
    expect(seekSpy).toHaveBeenCalledWith(0);
    act(() => { result.current.seekToPercent(150); });
    expect(seekSpy).toHaveBeenCalledWith(10_000);
    player.dispose();
  });

  it("progress.currentMs is 0 at start", () => {
    const player = makePlayer(0, 10_000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    expect(result.current.progress.currentMs).toBe(0);
    player.dispose();
  });

  it("progress.remainingMs equals durationMs at start", () => {
    const player = makePlayer(0, 10_000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    expect(result.current.progress.remainingMs).toBe(10_000);
    player.dispose();
  });

  it("progress.percent matches fraction * 100", () => {
    const player = makePlayer(0, 10_000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 0, latest: 10_000 })
    );
    expect(result.current.progress.percent).toBeCloseTo(result.current.fraction * 100, 5);
    player.dispose();
  });

  it("isAtStart is true when currentT equals earliest", () => {
    const player = makePlayer(1000, 5000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 1000, latest: 5000 })
    );
    // player starts at earliest by default
    expect(result.current.isAtStart).toBe(true);
    player.dispose();
  });

  it("isAtLiveEdge is true when durationMs is 0", () => {
    const player = makePlayer(5000, 5000);
    const { result } = renderHook(() =>
      useReplayTimeline(player, { earliest: 5000, latest: 5000 })
    );
    expect(result.current.isAtLiveEdge).toBe(true);
    player.dispose();
  });
});
