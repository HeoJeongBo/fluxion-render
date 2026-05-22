import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplaySession } from "../../../features/session/model/replay-session";
import { useLiveTimeRange } from "./use-live-time-range";

describe("useLiveTimeRange", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns null timeRange initially", () => {
    const { result } = renderHook(() => useLiveTimeRange(null));
    expect(result.current.timeRange).toBeNull();
  });

  it("seed() sets timeRange immediately", () => {
    const { result } = renderHook(() => useLiveTimeRange(null));
    act(() => {
      result.current.seed({ earliest: 1000, latest: 2000 });
    });
    expect(result.current.timeRange).toEqual({ earliest: 1000, latest: 2000 });
  });

  it("polls session.getTimeRange() on interval", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();

    const spy = vi.spyOn(session, "getTimeRange").mockResolvedValue({ earliest: 100, latest: 500 });

    const { result } = renderHook(() => useLiveTimeRange(session, { intervalMs: 200 }));

    // Initial poll
    await act(async () => { await Promise.resolve(); });
    expect(result.current.timeRange).toEqual({ earliest: 100, latest: 500 });

    // Subsequent poll after interval
    spy.mockResolvedValue({ earliest: 100, latest: 800 });
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.timeRange).toEqual({ earliest: 100, latest: 800 });

    session.dispose();
    spy.mockRestore();
  });

  it("ignores errors from getTimeRange() silently", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    vi.spyOn(session, "getTimeRange").mockRejectedValue(new Error("not open"));

    const { result } = renderHook(() => useLiveTimeRange(session, { intervalMs: 100 }));
    await act(async () => { await Promise.resolve(); });

    // Should not throw and timeRange stays null
    expect(result.current.timeRange).toBeNull();
    session.dispose();
  });

  it("clears interval on unmount", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const session = new ReplaySession({ channels: [] });
    await session.open();

    const { unmount } = renderHook(() => useLiveTimeRange(session, { intervalMs: 500 }));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    session.dispose();
    clearSpy.mockRestore();
  });

  it("does not poll when session is null", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const before = setIntervalSpy.mock.calls.length;
    renderHook(() => useLiveTimeRange(null));
    expect(setIntervalSpy.mock.calls.length).toBe(before);
    setIntervalSpy.mockRestore();
  });
});
