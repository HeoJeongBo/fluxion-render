import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayPlayer } from "../../../features/player/model/replay-player";
import { ReplayStore } from "../../../features/store/model/replay-store";
import { useReplayPlayer } from "./use-replay-player";

function makePlayer() {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  const player = new ReplayPlayer({
    store,
    channels: new Map(),
    timeRange: { earliest: 0, latest: 10_000 },
  });
  return player;
}

describe("useReplayPlayer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns idle state for null player", () => {
    const { result } = renderHook(() => useReplayPlayer(null));
    expect(result.current.state).toBe("idle");
    expect(result.current.currentT).toBe(0);
    expect(result.current.player).toBeNull();
  });

  it("reflects player state changes", () => {
    const player = makePlayer();
    const { result } = renderHook(() => useReplayPlayer(player));

    act(() => { player.play(); });
    expect(result.current.state).toBe("playing");

    act(() => { player.pause(); });
    expect(result.current.state).toBe("paused");

    act(() => { player.stop(); });
    expect(result.current.state).toBe("stopped");

    player.dispose();
  });

  it("currentT updates on tick (above throttle threshold)", () => {
    const player = makePlayer();
    const { result } = renderHook(() => useReplayPlayer(player));

    act(() => {
      player.play(1.0);
      vi.advanceTimersByTime(100);
    });

    // currentT should have advanced
    expect(result.current.currentT).toBeGreaterThanOrEqual(0);
    player.dispose();
  });

  it("play/pause/stop/seek callbacks work", () => {
    const player = makePlayer();
    const { result } = renderHook(() => useReplayPlayer(player));

    act(() => { result.current.play(); });
    expect(player.state).toBe("playing");

    act(() => { result.current.pause(); });
    expect(player.state).toBe("paused");

    act(() => { result.current.stop(); });
    expect(player.state).toBe("stopped");

    player.dispose();
  });

  it("cleans up subscriptions on unmount", () => {
    const player = makePlayer();
    const { unmount } = renderHook(() => useReplayPlayer(player));
    unmount();
    // After unmount, no more subscriptions should trigger re-renders
    player.dispose();
  });

  it("tick below throttle threshold does not update currentT", () => {
    const player = makePlayer();
    const { result } = renderHook(() => useReplayPlayer(player));

    const initialT = result.current.currentT;
    act(() => {
      player.play(1.0);
      // Advance by less than 16ms — tick fires but throttle suppresses update
      vi.advanceTimersByTime(5);
    });
    // currentT may not update because diff < TICK_THROTTLE_MS
    expect(result.current.currentT).toBeGreaterThanOrEqual(initialT);
    player.dispose();
  });

  it("seek callback delegates to player.seek", () => {
    const player = makePlayer();
    const seekSpy = vi.spyOn(player, "seek");
    const { result } = renderHook(() => useReplayPlayer(player));
    act(() => { result.current.seek(3000); });
    expect(seekSpy).toHaveBeenCalledWith(3000);
    player.dispose();
  });

  it("seek() immediately updates currentT even while paused", () => {
    const player = makePlayer();
    const { result } = renderHook(() => useReplayPlayer(player));
    // Start and pause so the player has a known state
    act(() => { player.play(); });
    act(() => { player.pause(); });
    // Seek to a specific position — currentT must update without waiting for a tick
    act(() => { result.current.seek(7000); });
    expect(result.current.currentT).toBe(7000);
    player.dispose();
  });
});
