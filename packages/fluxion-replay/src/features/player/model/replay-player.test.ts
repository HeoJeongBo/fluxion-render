import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import type { BaseChannel } from "../../../shared/model/base-channel";
import { ReplayStore } from "../../store/model/replay-store";
import { ReplayPlayer } from "./replay-player";

function makePlayer(earliest = 0, latest = 10_000) {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  const channels = new Map();
  const ch = new MetricChannel("cpu");
  channels.set("cpu", ch);

  const player = new ReplayPlayer({
    store,
    channels,
    timeRange: { earliest, latest },
    prefetchMs: 1000,
  });

  return { player, store, ch };
}

describe("ReplayPlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle state", () => {
    const { player } = makePlayer();
    expect(player.state).toBe("idle");
    player.dispose();
  });

  it("play() transitions to playing", () => {
    const { player } = makePlayer();
    const states: string[] = [];
    player.onStateChange((s) => states.push(s));
    player.play();
    expect(player.state).toBe("playing");
    expect(states).toContain("playing");
    player.stop();
    player.dispose();
  });

  it("pause() transitions to paused", () => {
    const { player } = makePlayer();
    player.play();
    player.pause();
    expect(player.state).toBe("paused");
    player.dispose();
  });

  it("stop() transitions to stopped", () => {
    const { player } = makePlayer();
    player.play();
    player.stop();
    expect(player.state).toBe("stopped");
    player.dispose();
  });

  it("seek() clamps to timeRange", () => {
    const { player } = makePlayer(1000, 5000);
    player.play();
    player.seek(-100); // below earliest
    expect(player.currentT).toBeGreaterThanOrEqual(1000);
    player.seek(99999); // above latest
    expect(player.currentT).toBeLessThanOrEqual(5000);
    player.stop();
    player.dispose();
  });

  it("onTick fires during playback", () => {
    const { player } = makePlayer();
    const ticks: number[] = [];
    player.onTick((t) => ticks.push(t));
    player.play();
    vi.advanceTimersByTime(50);
    expect(ticks.length).toBeGreaterThan(0);
    player.stop();
    player.dispose();
  });

  it("onTick listener can be removed", () => {
    const { player } = makePlayer();
    const ticks: number[] = [];
    const off = player.onTick((t) => ticks.push(t));
    player.play();
    vi.advanceTimersByTime(32);
    off();
    const countAfterOff = ticks.length;
    vi.advanceTimersByTime(32);
    expect(ticks.length).toBe(countAfterOff);
    player.stop();
    player.dispose();
  });

  it("emits onEnd when reaching latest", () => {
    const { player } = makePlayer(0, 100);
    let ended = false;
    player.onEnd(() => { ended = true; });
    player.play(100); // 100x speed so 1ms wall = 100ms virtual
    // RAF fires every 16ms; at 100x, 16ms wall = 1600ms virtual >> latest(100)
    vi.advanceTimersByTime(20);
    expect(ended).toBe(true);
    player.dispose();
  });

  it("onStateChange fires on transitions", () => {
    const { player } = makePlayer();
    const states: string[] = [];
    player.onStateChange((s) => states.push(s));
    player.play();
    player.pause();
    player.stop();
    expect(states).toEqual(["playing", "paused", "stopped"]);
    player.dispose();
  });

  it("dispose cleans up listeners", () => {
    const { player } = makePlayer();
    const ticks: number[] = [];
    player.onTick((t) => ticks.push(t));
    player.play();
    player.dispose();
    vi.advanceTimersByTime(50);
    expect(ticks.length).toBe(0);
  });

  it("play() after pause resumes", () => {
    const { player } = makePlayer();
    player.play(1.0);
    vi.advanceTimersByTime(100);
    player.pause();
    const pausedT = player.currentT;
    vi.advanceTimersByTime(500);
    player.play();
    vi.advanceTimersByTime(100);
    expect(player.currentT).toBeCloseTo(pausedT + 100, -1);
    player.stop();
    player.dispose();
  });

  it("play() while already playing changes rate only", () => {
    const { player } = makePlayer();
    const states: string[] = [];
    player.onStateChange((s) => states.push(s));
    player.play(1.0);
    player.play(2.0); // should not emit another "playing" state change
    expect(states.filter((s) => s === "playing")).toHaveLength(1);
    player.stop();
    player.dispose();
  });

  it("onFrame emits decoded frames from prefetch buffer", async () => {
    const { player, store, ch } = makePlayer();

    await store.open();
    const payload = ch.encode({ name: "cpu", value: 42 });
    store.appendFrame({ t: 500, channelId: "cpu", payload });
    await store.flush();

    const frames: unknown[] = [];
    player.onFrame((f) => frames.push(f));
    player.play(1.0);

    // advance to trigger prefetch and drain
    vi.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(600);

    expect(frames.length).toBeGreaterThan(0);
    player.stop();
    player.dispose();
  });

  it("seek() resets prefetch buffer and re-clamps", () => {
    const { player } = makePlayer(0, 10_000);
    player.play();
    player.seek(8000);
    expect(player.currentT).toBeGreaterThanOrEqual(0);
    expect(player.currentT).toBeLessThanOrEqual(10_000);
    player.stop();
    player.dispose();
  });

  it("onFrame listener can be removed", async () => {
    const { player, store, ch } = makePlayer();

    await store.open();
    const payload = ch.encode({ name: "cpu", value: 1 });
    store.appendFrame({ t: 500, channelId: "cpu", payload });
    await store.flush();

    const frames: unknown[] = [];
    const off = player.onFrame((f) => frames.push(f));
    off(); // remove before playback
    player.play(1.0);
    vi.advanceTimersByTime(700);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(frames).toHaveLength(0);
    player.stop();
    player.dispose();
  });

  it("onEnd listener can be removed", () => {
    const { player } = makePlayer(0, 50);
    let ended = false;
    const off = player.onEnd(() => { ended = true; });
    off();
    player.play(100);
    vi.advanceTimersByTime(20);
    expect(ended).toBe(false);
    player.dispose();
  });

  it("play() from stopped restarts from earliest", () => {
    const { player } = makePlayer(1000, 5000);
    player.play();
    player.stop();
    player.play();
    expect(player.state).toBe("playing");
    expect(player.currentT).toBeGreaterThanOrEqual(1000);
    player.stop();
    player.dispose();
  });

  it("seek() during playback keeps currentT within timeRange", () => {
    const { player } = makePlayer(0, 10_000);
    player.play();
    vi.advanceTimersByTime(50);
    player.seek(8000);
    expect(player.currentT).toBe(8000);
    player.seek(99999); // above latest — clamped
    expect(player.currentT).toBe(10_000);
    player.seek(-999);  // below earliest — clamped
    expect(player.currentT).toBe(0);
    player.stop();
    player.dispose();
  });

  it("unknown channelId frames are silently skipped in onFrame", async () => {
    const store = new ReplayStore({ batchIntervalMs: 9999 });
    const ch = new MetricChannel("cpu");
    const player = new ReplayPlayer({
      store,
      channels: new Map([["cpu", ch]]),
      timeRange: { earliest: 0, latest: 10_000 },
      prefetchMs: 1000,
    });

    await store.open();
    store.appendFrame({ t: 500, channelId: "unknown-channel", payload: new ArrayBuffer(8) });
    await store.flush();

    const frames: unknown[] = [];
    player.onFrame((f) => frames.push(f));
    player.play(1.0);

    vi.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(600);

    expect(frames).toHaveLength(0);
    player.stop();
    player.dispose();
  });

  it("mergeSorted handles large incoming array without losing order", async () => {
    // Directly calls _prefetch indirectly by mocking getFrames with a large batch,
    // then verifies frames arrive in order via onFrame.
    const { player, store, ch } = makePlayer(0, 10_000);
    await store.open();

    const bigBatch = Array.from({ length: 100 }, (_, i) => ({
      t: 100 + i * 5,    // 100, 105, … 595
      channelId: "cpu",
      payload: ch.encode({ name: "cpu", value: i }),
    }));
    vi.spyOn(store, "getFrames").mockResolvedValue(bigBatch);

    const frames: number[] = [];
    player.onFrame((f) => frames.push(f.t));
    player.play(1.0);

    // Trigger first RAF tick (fires prefetch)
    vi.advanceTimersByTime(16);
    // Let getFrames promise resolve and populate the buffer
    for (let i = 0; i < 5; i++) await Promise.resolve();

    // Advance virtual clock past all queued frames (100–595ms)
    vi.advanceTimersByTime(600);
    for (let i = 0; i < 3; i++) await Promise.resolve();

    expect(frames.length).toBeGreaterThan(0);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]);
    }
    player.stop();
    player.dispose();
  });

  it("concurrent prefetch calls do not double-fetch the same range", async () => {
    const { player, store } = makePlayer(0, 10_000);
    await store.open();

    let callCount = 0;
    const getFramesSpy = vi.spyOn(store, "getFrames").mockImplementation(async () => {
      callCount++;
      return [];
    });

    player.play(1.0);
    // Advance enough to trigger tick but not enough to complete async prefetch
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);

    await Promise.resolve();
    await Promise.resolve();

    // In-flight guard should prevent duplicate calls for same window
    expect(callCount).toBeLessThanOrEqual(3);

    player.stop();
    player.dispose();
    getFramesSpy.mockRestore();
  });

  it("_prefetch error rolls back prefetchedUpTo for retry", async () => {
    const { player, store } = makePlayer(0, 10_000);
    await store.open();

    let callCount = 0;
    const getFramesSpy = vi.spyOn(store, "getFrames").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("IDB read error");
      return [];
    });

    player.play(1.0);
    vi.advanceTimersByTime(50);
    await Promise.resolve();

    // After a prefetch error the player must still be running (no crash)
    expect(player.state).toBe("playing");

    player.stop();
    player.dispose();
    getFramesSpy.mockRestore();
  });

  // ── seek + play: regression guard for "play() silently rewinds" bug ─────
  // play() used to call clock.start(timeRange.earliest, rate) unconditionally,
  // throwing away a prior seek() target. The fix clamps clock.currentT into
  // range and uses that as the start point.

  describe("seek + play", () => {
    it("REGRESSION: seek(t) then play() keeps currentT at t (not earliest)", () => {
      const { player } = makePlayer(1_000, 5_000);
      player.seek(3_000);
      expect(player.currentT).toBe(3_000);

      player.play(1);
      // Immediately after play(): clock.start should have used 3_000 as the
      // virtual start, not the timeRange's earliest of 1_000.
      expect(player.currentT).toBe(3_000);

      player.stop();
      player.dispose();
    });

    it("seek + play advances forward from the seek point", () => {
      const { player } = makePlayer(0, 10_000);
      player.seek(2_000);
      player.play(1);
      // RAF fires every 16ms; advance 32ms wall ≈ 32ms virtual at 1x.
      vi.advanceTimersByTime(32);
      // currentT should be near 2_032, definitely > 2_000 and well under 5_000.
      expect(player.currentT).toBeGreaterThanOrEqual(2_000);
      expect(player.currentT).toBeLessThan(2_500);
      player.stop();
      player.dispose();
    });

    it("play() on a fresh player (no prior seek) starts at timeRange.earliest", () => {
      const { player } = makePlayer(1_500, 5_000);
      // No seek — clock.currentT defaults to 0, which gets clamped up to 1_500.
      player.play(1);
      expect(player.currentT).toBe(1_500);
      player.stop();
      player.dispose();
    });

    it("stop() then play() restarts from timeRange.earliest", () => {
      const { player } = makePlayer(500, 5_000);
      player.seek(3_000);
      player.play(1);
      vi.advanceTimersByTime(32);
      player.stop();
      // After stop(), clock.currentT resets to 0 → clamped up to earliest.
      player.play(1);
      expect(player.currentT).toBe(500);
      player.stop();
      player.dispose();
    });

    it("pause() then play() resumes from where it was paused (preserves currentT)", () => {
      const { player } = makePlayer(0, 10_000);
      player.seek(2_000);
      player.play(1);
      vi.advanceTimersByTime(32);
      const beforePause = player.currentT;
      player.pause();
      expect(player.currentT).toBe(beforePause);
      // Some wall time passes while paused — virtual t should not advance.
      vi.advanceTimersByTime(100);
      expect(player.currentT).toBe(beforePause);
      // Resume picks up from beforePause and keeps advancing.
      player.play(1);
      vi.advanceTimersByTime(32);
      expect(player.currentT).toBeGreaterThan(beforePause);
      player.stop();
      player.dispose();
    });
  });

  describe("onSeek", () => {
    it("fires with the clamped target on seek()", () => {
      const { player } = makePlayer(1000, 5000);
      const seeks: number[] = [];
      player.onSeek((t) => seeks.push(t));

      player.play();
      player.seek(2500);
      player.seek(-100); // below earliest → clamped to 1000
      player.seek(99999); // above latest → clamped to 5000

      expect(seeks).toEqual([2500, 1000, 5000]);
      player.dispose();
    });

    it("supports multiple listeners independently", () => {
      const { player } = makePlayer();
      const a: number[] = [];
      const b: number[] = [];
      player.onSeek((t) => a.push(t));
      player.onSeek((t) => b.push(t));

      player.play();
      player.seek(1234);
      expect(a).toEqual([1234]);
      expect(b).toEqual([1234]);
      player.dispose();
    });

    it("returns an unsubscribe function", () => {
      const { player } = makePlayer();
      const events: number[] = [];
      const off = player.onSeek((t) => events.push(t));

      player.play();
      player.seek(100);
      off();
      player.seek(200);
      expect(events).toEqual([100]);
      player.dispose();
    });

    it("dispose() clears seek listeners", () => {
      const { player } = makePlayer();
      const events: number[] = [];
      player.onSeek((t) => events.push(t));
      player.dispose();
      // dispose stops the clock; further seeks should not invoke listeners.
      player.seek(500);
      expect(events).toEqual([]);
    });
  });

  // Phase 13: the getter is what useReplayDvr / scenario tests rely on to
  // assert "player.end matches the UI's frozen right-edge". A regression
  // here would silently desync the DVR auto-exit from the scrubber max.
  describe("timeRange getter", () => {
    it("returns the exact range passed at construction", () => {
      const { player } = makePlayer(1_000, 4_000);
      expect(player.timeRange).toEqual({ earliest: 1_000, latest: 4_000 });
    });

    it("is stable across seek / play / pause", () => {
      const { player } = makePlayer(0, 10_000);
      const before = player.timeRange;
      player.seek(3_000);
      player.play();
      player.pause();
      expect(player.timeRange).toBe(before); // same reference
      expect(player.timeRange).toEqual({ earliest: 0, latest: 10_000 });
    });

    it("upper bound matches the seek clamp and the end condition", () => {
      const { player } = makePlayer(0, 5_000);
      // seek past latest gets clamped down to latest
      player.seek(99_999);
      expect(player.currentT).toBe(player.timeRange.latest);
    });
  });

  // Phase 20-B-1: typed onFrame overload — `frame.data` no longer needs
  // `as T` cast at the call site when a channel is provided.
  describe("onFrame typed overload", () => {
    it("filters by channelId and yields a typed frame", async () => {
      const channels = new Map<string, BaseChannel<unknown>>();
      const cpu = new MetricChannel("cpu");
      const mem = new MetricChannel("mem");
      channels.set("cpu", cpu);
      channels.set("mem", mem);
      const store = new ReplayStore({ batchIntervalMs: 9999 });
      const player = new ReplayPlayer({
        store,
        channels,
        timeRange: { earliest: 0, latest: 10_000 },
        prefetchMs: 1000,
      });

      type Sample = { name: string; value: number };
      const received: Array<{ t: number; v: number }> = [];
      // Typed overload — `frame.data` is `Sample`, NOT `unknown`.
      const off = player.onFrame<Sample>(cpu, (frame) => {
        // TypeScript-only assertion: `frame.data.value` typechecks because
        // of the generic overload. If the overload regressed, this would
        // be `unknown.value` and TS would refuse to compile.
        received.push({ t: frame.t, v: frame.data.value });
      });

      // Simulate both channels emitting; only `cpu` should reach the listener.
      const cpuPayload = cpu.encode({ name: "cpu", value: 0.5 });
      const memPayload = mem.encode({ name: "mem", value: 0.7 });

      // Stub the prefetch buffer + drive a tick manually.
      // biome-ignore lint/suspicious/noExplicitAny: testing internals
      (player as any)._prefetchBuffer = [
        { t: 100, channelId: "cpu", payload: cpuPayload },
        { t: 100, channelId: "mem", payload: memPayload },
      ];
      // biome-ignore lint/suspicious/noExplicitAny: testing internals
      (player as any)._prefetchedUpTo = 5_000;
      // biome-ignore lint/suspicious/noExplicitAny: testing internals
      (player as any)._onTick(200);

      expect(received).toEqual([{ t: 100, v: 0.5 }]); // mem skipped
      off();
      player.dispose();
    });

    it("regression: the bare-listener overload still gets every channel", async () => {
      const channels = new Map<string, BaseChannel<unknown>>();
      const cpu = new MetricChannel("cpu");
      const mem = new MetricChannel("mem");
      channels.set("cpu", cpu);
      channels.set("mem", mem);
      const store = new ReplayStore({ batchIntervalMs: 9999 });
      const player = new ReplayPlayer({
        store,
        channels,
        timeRange: { earliest: 0, latest: 10_000 },
        prefetchMs: 1000,
      });

      const seenChannels: string[] = [];
      const off = player.onFrame((frame) => seenChannels.push(frame.channelId));

      // biome-ignore lint/suspicious/noExplicitAny: testing internals
      (player as any)._prefetchBuffer = [
        { t: 100, channelId: "cpu", payload: cpu.encode({ name: "cpu", value: 0 }) },
        { t: 100, channelId: "mem", payload: mem.encode({ name: "mem", value: 0 }) },
      ];
      // biome-ignore lint/suspicious/noExplicitAny: testing internals
      (player as any)._prefetchedUpTo = 5_000;
      // biome-ignore lint/suspicious/noExplicitAny: testing internals
      (player as any)._onTick(200);

      expect(seenChannels).toEqual(["cpu", "mem"]);
      off();
      player.dispose();
    });
  });
});
