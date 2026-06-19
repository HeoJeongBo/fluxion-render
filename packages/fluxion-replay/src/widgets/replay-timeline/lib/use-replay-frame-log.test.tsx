import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
  ReplayPlayer,
  ReplayPlayerFrame,
} from "../../../features/player/model/replay-player";
import { useReplayFrameLog } from "./use-replay-frame-log";

/**
 * Minimal fake player: captures the `onFrame` listener so a test can emit
 * frames synchronously, and reports unsubscribe via a flag.
 */
function makeFakePlayer() {
  let listener: ((f: ReplayPlayerFrame) => void) | null = null;
  let unsubscribed = false;
  const player = {
    onFrame: (l: (f: ReplayPlayerFrame) => void) => {
      listener = l;
      return () => {
        unsubscribed = true;
        listener = null;
      };
    },
  } as unknown as ReplayPlayer;
  return {
    player,
    emit: (f: Partial<ReplayPlayerFrame> & { channelId: string; t: number }) =>
      listener?.(f as ReplayPlayerFrame),
    get unsubscribed() {
      return unsubscribed;
    },
  };
}

describe("useReplayFrameLog", () => {
  it("returns an empty array for a null player", () => {
    const { result } = renderHook(() => useReplayFrameLog(null));
    expect(result.current).toEqual([]);
  });

  it("collects frames in arrival order", () => {
    const fake = makeFakePlayer();
    const { result } = renderHook(() => useReplayFrameLog(fake.player));
    act(() => {
      fake.emit({ channelId: "logs", t: 1 });
      fake.emit({ channelId: "logs", t: 2 });
    });
    expect(result.current.map((f) => f.t)).toEqual([1, 2]);
  });

  it("excludes the configured channels", () => {
    const fake = makeFakePlayer();
    const { result } = renderHook(() =>
      useReplayFrameLog(fake.player, { exclude: ["video"] }),
    );
    act(() => {
      fake.emit({ channelId: "video", t: 1 });
      fake.emit({ channelId: "logs", t: 2 });
      fake.emit({ channelId: "video", t: 3 });
    });
    expect(result.current.map((f) => f.channelId)).toEqual(["logs"]);
  });

  it("retains only the most recent `max` frames", () => {
    const fake = makeFakePlayer();
    const { result } = renderHook(() => useReplayFrameLog(fake.player, { max: 3 }));
    act(() => {
      for (let i = 0; i < 6; i++) fake.emit({ channelId: "logs", t: i });
    });
    expect(result.current.map((f) => f.t)).toEqual([3, 4, 5]);
  });

  it("resets and unsubscribes when the player changes to null", () => {
    const fake = makeFakePlayer();
    const { result, rerender } = renderHook(
      ({ p }: { p: ReplayPlayer | null }) => useReplayFrameLog(p),
      { initialProps: { p: fake.player as ReplayPlayer | null } },
    );
    act(() => {
      fake.emit({ channelId: "logs", t: 1 });
    });
    expect(result.current).toHaveLength(1);

    rerender({ p: null });
    expect(fake.unsubscribed).toBe(true);
    expect(result.current).toEqual([]);
  });
});
