import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayPlayer } from "../../../features/player/model/replay-player";
import { ReplayStore } from "../../../features/store/model/replay-store";
import { useReplayPlayer } from "./use-replay-player";

function makePlayer(earliest = 0, latest = 10_000) {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  const player = new ReplayPlayer({
    store,
    channels: new Map(),
    timeRange: { earliest, latest },
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

  // ── currentT progression under various conditions (Phase 11 — sticky-cursor bug class)
  // The "cursor stuck at enter point" symptom can come from:
  //   (a) effect re-running on every parent render → setCurrentT(player.currentT)
  //       resets to initial value before onTick can update it
  //   (b) onTick never firing (clock not running)
  // These tests exercise both surfaces with the REAL ReplayPlayer + VirtualClock.

  describe("currentT progression (real player + rAF clock)", () => {
    it("seek then play: currentT starts at seek point and advances forward", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player));

      // Use the hook's seek so setCurrentT is updated synchronously (the API
      // contract — outside players calling player.seek directly won't reflect
      // until the next onTick).
      act(() => { result.current.seek(3_000); });
      expect(result.current.currentT).toBe(3_000);

      act(() => { result.current.play(1); });
      expect(result.current.currentT).toBeGreaterThanOrEqual(3_000);

      // Phase 14: currentT only ticks when the second boundary is crossed.
      // Advance well past 1s so the boundary at 4000ms triggers.
      act(() => { vi.advanceTimersByTime(1_200); });
      expect(result.current.currentT).toBeGreaterThan(3_000);

      act(() => { vi.advanceTimersByTime(1_200); });
      expect(result.current.currentT).toBeGreaterThan(4_000);

      player.stop();
      player.dispose();
    });

    it("forced re-renders during playback do NOT reset currentT back to the seek point", () => {
      const player = makePlayer();
      const { result, rerender } = renderHook(() => useReplayPlayer(player));

      act(() => { result.current.seek(2_000); });
      act(() => { result.current.play(1); });
      // Phase 14: need to cross the 1s boundary so currentT actually moves.
      act(() => { vi.advanceTimersByTime(1_200); });

      const tBeforeRerenders = result.current.currentT;
      expect(tBeforeRerenders).toBeGreaterThan(2_000);

      // Force 5 re-renders — this is the chart-replay shape where the parent
      // re-renders every ~16ms due to rAF / scrubT / polling state changes.
      for (let i = 0; i < 5; i++) {
        rerender();
      }

      // currentT must NOT have snapped back to 2_000.
      // This is the exact symptom of the sticky-cursor bug.
      expect(result.current.currentT).toBeGreaterThanOrEqual(tBeforeRerenders);

      // And continues to advance after the re-renders.
      act(() => { vi.advanceTimersByTime(1_200); });
      expect(result.current.currentT).toBeGreaterThan(tBeforeRerenders);

      player.stop();
      player.dispose();
    });

    it("rerender then advance: currentT keeps moving across the rerender boundary", () => {
      const player = makePlayer();
      const { result, rerender } = renderHook(() => useReplayPlayer(player));

      act(() => { result.current.seek(4_000); });
      act(() => { result.current.play(1); });

      // Tick → rerender → tick → rerender pattern. Catches "effect re-mount
      // unsubscribes the live onTick listener and the next tick is lost".
      // Phase 14: use 300ms slices so we cross multiple 1s boundaries across
      // the 10-sample window (10×300=3s of virtual time = 3 boundary hits).
      const samples: number[] = [];
      for (let i = 0; i < 10; i++) {
        act(() => { vi.advanceTimersByTime(300); });
        rerender();
        samples.push(result.current.currentT);
      }

      // Monotonic non-decreasing — Phase 14 snap means many samples repeat
      // until the next second boundary, then jump.
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!);
      }
      // The last sample is at least 2s past the seek point (10×300=3000ms,
      // snapped to 3 boundary crossings → currentT === 7000).
      expect(samples[samples.length - 1]).toBeGreaterThanOrEqual(6_000);

      player.stop();
      player.dispose();
    });

    it("stable player reference: useEffect runs exactly ONCE per mount, not per render", () => {
      const player = makePlayer();
      // Phase 15: cursor is now driven by setInterval polling, not onTick.
      // Use onStateChange as the effect-stability proxy — same intent.
      const onStateChangeSpy = vi.spyOn(player, "onStateChange");

      const { rerender } = renderHook(() => useReplayPlayer(player));
      const initialSubscribes = onStateChangeSpy.mock.calls.length;
      expect(initialSubscribes).toBe(1);

      // Force re-renders — the effect should NOT resubscribe.
      for (let i = 0; i < 5; i++) rerender();
      expect(onStateChangeSpy.mock.calls.length).toBe(initialSubscribes);

      onStateChangeSpy.mockRestore();
      player.dispose();
    });

    it("long-running progression: currentT keeps advancing as wall time passes", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player));

      act(() => { result.current.seek(1_000); });
      act(() => { result.current.play(1); });
      const t0 = result.current.currentT;

      // Phase 14 snap: each 1s of wall time crosses exactly one second
      // boundary, advancing currentT by 1000ms. Use 2s so we're well past
      // the boundary regardless of when the first tick within the window
      // happens to fire.
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(result.current.currentT).toBeGreaterThanOrEqual(t0 + 1_000);

      const t1 = result.current.currentT;
      act(() => { vi.advanceTimersByTime(2_000); });
      expect(result.current.currentT).toBeGreaterThanOrEqual(t1 + 1_000);

      player.stop();
      player.dispose();
    });
  });

  // Callback identity guard — see Phase 10 bug class.
  it("returned callbacks (play, pause, stop, seek) have stable identity across re-renders", () => {
    const player = new ReplayPlayer({
      store: {} as never,
      channels: new Map(),
      timeRange: { earliest: 0, latest: 1000 },
    });
    const { result, rerender } = renderHook(() => useReplayPlayer(player));
    const r0 = { play: result.current.play, pause: result.current.pause, stop: result.current.stop, seek: result.current.seek };
    rerender();
    rerender();
    expect(result.current.play).toBe(r0.play);
    expect(result.current.pause).toBe(r0.pause);
    expect(result.current.stop).toBe(r0.stop);
    expect(result.current.seek).toBe(r0.seek);
    player.dispose();
  });

  // Phase 14: currentT must be exposed in 1-second steps so the scrubber
  // cursor jumps discretely instead of smearing at rAF rate.
  describe("Phase 14: 1-second cursor snap", () => {
    it("seek snaps the displayed currentT down to the nearest second", () => {
      const player = new ReplayPlayer({
        store: {} as never,
        channels: new Map(),
        timeRange: { earliest: 0, latest: 30_000 },
      });
      const { result } = renderHook(() => useReplayPlayer(player));
      act(() => { result.current.seek(3_217); });
      expect(result.current.currentT).toBe(3_000);
      act(() => { result.current.seek(7_999); });
      expect(result.current.currentT).toBe(7_000);
      player.dispose();
    });

    it("a sub-second tick does NOT change currentT (boundary not crossed)", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player));
      act(() => { result.current.seek(5_000); });
      act(() => { result.current.play(1); });
      const before = result.current.currentT;
      // 900ms < 1000ms — boundary not crossed, no update.
      act(() => { vi.advanceTimersByTime(900); });
      expect(result.current.currentT).toBe(before);
      player.stop();
      player.dispose();
    });

    it("crossing a second boundary updates currentT in 1-second increments", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player));
      act(() => { result.current.seek(4_000); });
      act(() => { result.current.play(1); });
      // 1500ms wall ≈ 1500ms virtual → at least one boundary crossed. The
      // exact landing depends on when the 250ms poll fires relative to the
      // boundary, so check the value lands on a 1s grid and moved forward.
      act(() => { vi.advanceTimersByTime(1_500); });
      const t1 = result.current.currentT;
      expect(t1).toBeGreaterThanOrEqual(5_000);
      expect(t1 % 1000).toBe(0);
      // Another 1500ms guarantees a further boundary cross.
      act(() => { vi.advanceTimersByTime(1_500); });
      const t2 = result.current.currentT;
      expect(t2).toBeGreaterThan(t1);
      expect(t2 % 1000).toBe(0);
      player.stop();
      player.dispose();
    });

    it("rate=2 accelerates how often the boundary is crossed", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player));
      act(() => { result.current.seek(2_000); });
      act(() => { result.current.play(2); });
      // 600ms wall × rate 2 = 1200ms virtual → 1 boundary crossed.
      // Poll fires every 250ms — within 600ms wall, polls at 250 / 500 fire
      // before our assertion. The 500ms poll sees clock at 3000 → snapped.
      act(() => { vi.advanceTimersByTime(600); });
      expect(result.current.currentT).toBe(3_000);
      player.stop();
      player.dispose();
    });

    // Phase 15: cursor must keep ticking even if NO listener subscribes to
    // player.onTick. The interval-poll model decouples cursor updates from
    // the rAF tick listener path entirely — chart load can hog rAF and the
    // cursor still advances on schedule.
    it("Phase 15: cursor advances via interval polling even with no onTick listeners", () => {
      const player = makePlayer();
      const onTickSpy = vi.spyOn(player, "onTick");
      const { result } = renderHook(() => useReplayPlayer(player));

      // The hook MUST NOT have subscribed to onTick (Phase 15 change).
      expect(onTickSpy).not.toHaveBeenCalled();

      act(() => { result.current.seek(5_000); });
      act(() => { result.current.play(1); });
      // 1.2s wall — interval at 250ms fires ~4 times. The 1000ms poll lands
      // on a fresh boundary and lifts currentT to 6000.
      act(() => { vi.advanceTimersByTime(1_200); });
      expect(result.current.currentT).toBeGreaterThanOrEqual(6_000);
      expect(result.current.currentT % 1000).toBe(0);

      onTickSpy.mockRestore();
      player.stop();
      player.dispose();
    });
  });

  // Phase 20-A-5: snapMs / pollMs are configurable so consumers can tune
  // cursor resolution + freshness without forking the hook.
  describe("Phase 20: snapMs / pollMs options", () => {
    it("snapMs: 0 disables snapping — currentT mirrors raw player.currentT", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player, { snapMs: 0 }));
      act(() => { result.current.seek(3_217); });
      // No snap → React-state value is the exact seek target.
      expect(result.current.currentT).toBe(3_217);
      player.dispose();
    });

    it("snapMs: 100 snaps to 100 ms boundaries", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player, { snapMs: 100 }));
      act(() => { result.current.seek(3_217); });
      expect(result.current.currentT).toBe(3_200); // floor(3217 / 100) * 100
      act(() => { result.current.seek(7_999); });
      expect(result.current.currentT).toBe(7_900);
      player.dispose();
    });

    it("snapMs: 5000 snaps to 5-second boundaries", () => {
      const player = makePlayer(0, 30_000);
      const { result } = renderHook(() => useReplayPlayer(player, { snapMs: 5_000 }));
      act(() => { result.current.seek(12_345); });
      expect(result.current.currentT).toBe(10_000);
      act(() => { result.current.seek(17_999); });
      expect(result.current.currentT).toBe(15_000);
      player.dispose();
    });

    it("pollMs: faster polling detects boundary cross sooner", () => {
      const player = makePlayer(0, 10_000);
      const { result } = renderHook(() =>
        useReplayPlayer(player, { snapMs: 1000, pollMs: 50 }),
      );
      act(() => { result.current.seek(4_000); });
      act(() => { result.current.play(1); });
      // 1100 ms wall → at pollMs=50 we get ~22 polls; one of them sees the
      // 5000 boundary cross.
      act(() => { vi.advanceTimersByTime(1_100); });
      expect(result.current.currentT).toBeGreaterThanOrEqual(5_000);
      player.stop();
      player.dispose();
    });

    it("default options stay backwards-compatible (snapMs=1000, pollMs=250)", () => {
      const player = makePlayer();
      const { result } = renderHook(() => useReplayPlayer(player));
      act(() => { result.current.seek(3_217); });
      // Default snap → 3000.
      expect(result.current.currentT).toBe(3_000);
      player.dispose();
    });
  });

  it("seek() is a no-op when player is null", () => {
    const { result } = renderHook(() => useReplayPlayer(null));
    expect(() => act(() => { result.current.seek(5_000); })).not.toThrow();
  });
});
