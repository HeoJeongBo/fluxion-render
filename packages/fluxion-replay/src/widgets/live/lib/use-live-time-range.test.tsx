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

  it("cleanup does not throw when timerRef is null (session=null, no interval set)", () => {
    // When session=null, the effect returns early without setting a timer.
    // Unmount should not throw even though timerRef.current is still null.
    const { unmount } = renderHook(() => useLiveTimeRange(null));
    expect(() => unmount()).not.toThrow();
  });

  // ── Callback identity (regression for chart-replay's "B~B / scrubMin===scrubMax" bug)
  // If `seed` (or any returned callback) is a new reference each render,
  // consumers that put it in useEffect deps will re-fire forever — in
  // chart-replay that meant clearRecording() ran every render, wiping the
  // store and pinning the scrubber to seed(now, now). This describe lives
  // here as a permanent guard for that whole class of regression.

  describe("callback identity stability", () => {
    it("seed is the same reference across re-renders", () => {
      const { result, rerender } = renderHook(() => useLiveTimeRange(null));
      const seedFirst = result.current.seed;
      rerender();
      rerender();
      rerender();
      expect(result.current.seed).toBe(seedFirst);
    });

    it("seed identity is also stable across timeRange state changes", () => {
      const { result } = renderHook(() => useLiveTimeRange(null));
      const seedBefore = result.current.seed;
      act(() => {
        result.current.seed({ earliest: 1, latest: 2 });
      });
      // Even after setState causes a re-render, the seed function reference
      // must NOT change — otherwise any useEffect with `seed` in deps fires
      // on every state change in this hook.
      expect(result.current.seed).toBe(seedBefore);
      expect(result.current.timeRange).toEqual({ earliest: 1, latest: 2 });
    });
  });

  // ── Scenario: empty session at mount → seed() bridges the polling gap ───
  // Reproduces the chart-replay demo flow: page enters, session opens, but
  // the store is empty so the first poll returns null. Without an explicit
  // seed() the scrubber stays disabled for ~500ms before frames land. The
  // demo seeds right after startRecording — this verifies that seed wins
  // over the (null-returning) first poll and that a subsequent poll with
  // real frames then overwrites the seed cleanly.
  it("seed() bridges the empty-store window then polling overwrites with real range", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();

    // First polls return null (empty store); later polls return real range.
    let pollResult: { earliest: number; latest: number } | null = null;
    const spy = vi.spyOn(session, "getTimeRange").mockImplementation(async () => pollResult);

    const { result } = renderHook(() => useLiveTimeRange(session, { intervalMs: 200 }));

    // First poll resolves to null → timeRange stays null.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.timeRange).toBeNull();

    // App seeds right after startRecording — scrubber becomes live IMMEDIATELY.
    const seedNow = 1_700_000_000_000;
    act(() => {
      result.current.seed({ earliest: seedNow, latest: seedNow });
    });
    expect(result.current.timeRange).toEqual({ earliest: seedNow, latest: seedNow });

    // Frames start landing — next poll picks up real bounds. The seed is
    // overwritten cleanly by the polling result (no flicker back to null).
    pollResult = { earliest: seedNow, latest: seedNow + 1_500 };
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(result.current.timeRange).toEqual({ earliest: seedNow, latest: seedNow + 1_500 });

    session.dispose();
    spy.mockRestore();
  });
});
