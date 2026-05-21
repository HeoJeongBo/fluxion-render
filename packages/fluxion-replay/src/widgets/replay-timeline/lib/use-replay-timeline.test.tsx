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
});
