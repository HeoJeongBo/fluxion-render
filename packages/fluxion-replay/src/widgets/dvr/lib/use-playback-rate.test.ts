import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakePlayer } from "../../chart-replay/lib/chart-replay-fixtures";
import { usePlaybackRate } from "./use-playback-rate";

describe("usePlaybackRate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("defaults to rate 1", () => {
    const { result } = renderHook(() => usePlaybackRate({ player: null }));
    expect(result.current.rate).toBe(1);
  });

  it("respects custom initialRate", () => {
    const { result } = renderHook(() =>
      usePlaybackRate({ player: null, initialRate: 2 }),
    );
    expect(result.current.rate).toBe(2);
  });

  it("setRate updates the rate", () => {
    const { result } = renderHook(() => usePlaybackRate({ player: null }));
    act(() => result.current.setRate(0.5));
    expect(result.current.rate).toBe(0.5);
  });

  it("setRate calls player.play(r) when player is playing", () => {
    const player = makeFakePlayer(0);
    // FakePlayer.play() is a vi.fn that doesn't flip real state.
    // Provide a minimal player-like object whose state IS "playing".
    const playingPlayer = {
      ...player,
      get state() {
        return "playing" as const;
      },
    };

    const { result } = renderHook(() =>
      usePlaybackRate({ player: playingPlayer as never }),
    );
    act(() => result.current.setRate(2));

    expect(player.play).toHaveBeenCalledWith(2);
  });

  it("setRate does NOT call player.play when player is idle", () => {
    const player = makeFakePlayer(0);
    // FakePlayer.state is "idle" by default

    const { result } = renderHook(() => usePlaybackRate({ player: player as never }));
    vi.clearAllMocks();

    act(() => result.current.setRate(4));

    expect(player.play).not.toHaveBeenCalled();
  });

  it("setRate with null player does not throw", () => {
    const { result } = renderHook(() => usePlaybackRate({ player: null }));
    expect(() => act(() => result.current.setRate(2))).not.toThrow();
    expect(result.current.rate).toBe(2);
  });

  it("picks up a new player reference without recreating setRate", () => {
    const player1 = makeFakePlayer(0);
    const player2 = makeFakePlayer(0);

    // Wrap in playing-state proxy so setRate actually calls play()
    const playing = (p: ReturnType<typeof makeFakePlayer>) => ({
      ...p,
      get state() {
        return "playing" as const;
      },
    });

    const { result, rerender } = renderHook(
      (p: ReturnType<typeof makeFakePlayer>) =>
        usePlaybackRate({ player: playing(p) as never }),
      { initialProps: player1 },
    );

    const setRate1 = result.current.setRate;
    rerender(player2);
    // Identity stable — same callback reference after rerender
    expect(result.current.setRate).toBe(setRate1);

    // Now operates on player2 (via ref)
    act(() => result.current.setRate(4));
    expect(player2.play).toHaveBeenCalledWith(4);
    expect(player1.play).not.toHaveBeenCalledWith(4);
  });
});
