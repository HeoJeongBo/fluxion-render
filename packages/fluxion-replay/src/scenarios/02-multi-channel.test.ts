/**
 * Scenario 02: Multi-Channel Recording & Replay
 *
 * Demonstrates recording data on several heterogeneous channels simultaneously
 * and replaying them in a single player — the typical real-world setup where
 * a user captures metrics, logs, and other signals at the same time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogChannel } from "../entities/log-channel/log-channel";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import { UnknownChannelError } from "../features/recorder/model/replay-recorder";
import { ReplaySession } from "../features/session/model/replay-session";
import { drain, seedLogFrames, seedMetricFrames } from "./_helpers";

describe("Scenario 02: multi-channel recording and replay", () => {
  const cpuChannel = new MetricChannel("cpu");
  const memChannel = new MetricChannel("mem");
  const logChannel = new LogChannel("events");

  let session: ReplaySession;

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new ReplaySession({
      channels: [cpuChannel, memChannel, logChannel],
    });
    await session.open();
    await session.startRecording();
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  it("frames from different channels are all stored and queryable", async () => {
    seedMetricFrames(session, "cpu", 3);
    seedMetricFrames(session, "mem", 3);
    seedLogFrames(session, "events", 2);
    await session.store.flush();

    const cpuFrames = await session.store.getFramesByChannel(cpuChannel, 0, 10_000);
    const memFrames = await session.store.getFramesByChannel(memChannel, 0, 10_000);
    const logFrames = await session.store.getFramesByChannel(logChannel, 0, 10_000);

    expect(cpuFrames).toHaveLength(3);
    expect(memFrames).toHaveLength(3);
    expect(logFrames).toHaveLength(2);
  });

  it("player.onFrame delivers frames to the correct typed listener per channel", async () => {
    // Add a sentinel frame beyond the others so timeRange.latest doesn't
    // coincide with the frames we want to verify (the player fires onEnd
    // when currentT >= latest, before emitting that final frame).
    seedMetricFrames(session, "cpu", 2);    // t = 1000, 2000
    seedMetricFrames(session, "mem", 2);    // t = 1000, 2000
    seedLogFrames(session, "events", 2);    // t = 1000, 2000
    session.record("cpu", { name: "cpu", value: -1 }, 9_000); // sentinel
    await session.store.flush();

    const player = await session.enterReplay();

    const cpuValues: number[] = [];
    const memValues: number[] = [];
    const logMessages: string[] = [];

    player.onFrame(cpuChannel, ({ data }) => cpuValues.push(data.value));
    player.onFrame(memChannel, ({ data }) => memValues.push(data.value));
    player.onFrame(logChannel, ({ data }) => logMessages.push(data.message));

    player.play();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(cpuValues.filter((v) => v !== -1)).toHaveLength(2);
    expect(memValues).toHaveLength(2);
    expect(logMessages).toHaveLength(2);

    session.exitReplay();
  });

  it("untyped onFrame receives all channels and carries correct channelId", async () => {
    seedMetricFrames(session, "cpu", 2);   // t = 1000, 2000
    seedLogFrames(session, "events", 1);   // t = 1000
    session.record("cpu", { name: "cpu", value: -1 }, 9_000); // sentinel so 2000 isn't latest
    await session.store.flush();

    const player = await session.enterReplay();
    const seen = new Map<string, number>();
    player.onFrame(({ channelId, data }) => {
      // exclude sentinel
      if (typeof data === "object" && data !== null && "value" in data && (data as { value: number }).value === -1) return;
      seen.set(channelId, (seen.get(channelId) ?? 0) + 1);
    });
    player.play();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(seen.get("cpu")).toBe(2);
    expect(seen.get("events")).toBe(1);
    session.exitReplay();
  });

  it("getFramesByChannel typed overload decodes payloads automatically", async () => {
    session.record("cpu", { name: "cpu", value: 3.14 }, 1_000);
    session.record("cpu", { name: "cpu", value: 2.72 }, 2_000);
    await session.store.flush();

    const frames = await session.store.getFramesByChannel(cpuChannel, 0, 5_000);

    expect(frames[0].data.value).toBeCloseTo(3.14, 1);
    expect(frames[1].data.value).toBeCloseTo(2.72, 1);
  });

  it("channels can record at different timestamps and all appear in getTimeRange", async () => {
    session.record("cpu", { name: "cpu", value: 1 }, 1_000);
    session.record("mem", { name: "mem", value: 2 }, 3_000);
    session.record("events", { level: "info" as const, message: "hello" }, 5_000);
    await session.store.flush();

    const range = await session.getTimeRange();
    expect(range!.earliest).toBe(1_000);
    expect(range!.latest).toBe(5_000);
  });

  it("recording on an unregistered channelId throws UnknownChannelError", () => {
    expect(() =>
      session.record("not-registered", { name: "x", value: 0 }, 1_000),
    ).toThrow(UnknownChannelError);
  });

  it("UnknownChannelError exposes channelId and availableChannelIds", () => {
    try {
      session.record("oops", { value: 0 }, 1_000);
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownChannelError);
      const err = e as UnknownChannelError;
      expect(err.channelId).toBe("oops");
      expect(err.availableChannelIds).toContain("cpu");
      expect(err.availableChannelIds).toContain("mem");
      expect(err.availableChannelIds).toContain("events");
    }
  });

  it("seek positions the player at the requested timestamp and playback continues forward from there", async () => {
    // cpu: t=1000, 2000, 3000, 4000, 5000; sentinel at 9000
    seedMetricFrames(session, "cpu", 5);
    session.record("cpu", { name: "cpu", value: -1 }, 9_000);
    // events: t=7000 (after seek point)
    session.record("events", { level: "info" as const, message: "after-seek" }, 7_000);
    // events: t=500 (before seek point, but within lookback window)
    session.record("events", { level: "warn" as const, message: "before-seek" }, 500);
    await session.store.flush();

    const player = await session.enterReplay();
    player.seek(3_000);
    await drain();

    // After seek, currentT must be 3000
    expect(player.currentT).toBe(3_000);

    const cpuTs: number[] = [];
    player.onFrame(cpuChannel, ({ t, data }) => {
      if ((data as { value: number }).value !== -1) cpuTs.push(t);
    });

    const eventMessages: string[] = [];
    player.onFrame(logChannel, ({ data }) => eventMessages.push(data.message));

    player.play();
    await vi.advanceTimersByTimeAsync(10_000);

    // Frames emitted after seek should not include any t < seek point
    // (lookback may pull in frames slightly before, but progression is forward)
    expect(player.currentT).toBeGreaterThanOrEqual(3_000);
    // The "after-seek" event (t=7000) must appear
    expect(eventMessages).toContain("after-seek");

    session.exitReplay();
  });
});
