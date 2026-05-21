import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
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
});
