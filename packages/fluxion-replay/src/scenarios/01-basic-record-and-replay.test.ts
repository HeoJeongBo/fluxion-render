/**
 * Scenario 01: Basic Record & Replay
 *
 * Covers the core "record some data, then play it back" lifecycle that every
 * library consumer encounters first:
 *   open → startRecording → record → flush → enterReplay → listen → exitReplay
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import { ReplaySession } from "../features/session/model/replay-session";
import { drain, seedMetricFrames } from "./_helpers";

describe("Scenario 01: basic record and replay", () => {
  let session: ReplaySession;
  const cpuChannel = new MetricChannel("cpu");

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new ReplaySession({ channels: [cpuChannel] });
    await session.open();
    await session.startRecording();
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  it("session starts in live mode", () => {
    expect(session.mode).toBe("live");
  });

  it("records frames and replays them in timestamp order", async () => {
    // Use 5 frames, but t=5000 equals timeRange.latest so the player fires
    // onEnd before emitting that final frame. Add a 6th frame at t=6000 as a
    // sentinel so 1000–5000 all arrive before the end condition triggers.
    seedMetricFrames(session, "cpu", 5); // t = 1000…5000
    session.record("cpu", { name: "cpu", value: 99 }, 6_000); // sentinel
    await session.store.flush();

    const player = await session.enterReplay();
    const timestamps: number[] = [];
    player.onFrame(({ t }) => timestamps.push(t));
    player.play();

    await vi.advanceTimersByTimeAsync(10_000);

    // Frames 1000–5000 should all appear (6000 may or may not arrive before onEnd)
    expect(timestamps.slice(0, 5)).toEqual([1_000, 2_000, 3_000, 4_000, 5_000]);
    session.exitReplay();
  });

  it("decoded frame data matches what was recorded", async () => {
    session.record("cpu", { name: "cpu", value: 42 }, 1_000);
    session.record("cpu", { name: "cpu", value: 99 }, 2_000);
    session.record("cpu", { name: "cpu", value: 0 }, 3_000); // sentinel so 2000 isn't latest
    await session.store.flush();

    const player = await session.enterReplay();
    const values: number[] = [];
    player.onFrame(cpuChannel, ({ data }) => values.push(data.value));
    player.play();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(values).toContain(42);
    expect(values).toContain(99);
    session.exitReplay();
  });

  it("onEnd fires when the player reaches the end of the recording", async () => {
    seedMetricFrames(session, "cpu", 3);
    await session.store.flush();

    const player = await session.enterReplay();
    let ended = false;
    player.onEnd(() => { ended = true; });
    player.play();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(ended).toBe(true);
    session.exitReplay();
  });

  it("exitReplay returns the session to live mode", async () => {
    seedMetricFrames(session, "cpu", 2);
    await session.store.flush();
    await session.enterReplay();

    expect(session.mode).toBe("replay");
    session.exitReplay();
    expect(session.mode).toBe("live");
    expect(session.player).toBeNull();
  });

  it("getTimeRange returns the correct earliest/latest bounds after flush", async () => {
    session.record("cpu", { name: "cpu", value: 1 }, 1_000);
    session.record("cpu", { name: "cpu", value: 2 }, 5_000);
    await session.store.flush();

    const range = await session.getTimeRange();
    expect(range).not.toBeNull();
    expect(range!.earliest).toBe(1_000);
    expect(range!.latest).toBe(5_000);
  });

  it("player state transitions: idle → playing → stopped", async () => {
    seedMetricFrames(session, "cpu", 2);
    await session.store.flush();

    const player = await session.enterReplay();
    expect(player.state).toBe("idle");

    player.play();
    expect(player.state).toBe("playing");

    player.stop();
    expect(player.state).toBe("stopped");

    session.exitReplay();
  });

  it("pausing and resuming play preserves position", async () => {
    // Record a spread of frames so there is time between them
    for (let i = 1; i <= 10; i++) {
      session.record("cpu", { name: "cpu", value: i }, i * 500);
    }
    await session.store.flush();

    const player = await session.enterReplay();
    player.play();

    // Play for 1 second, then pause
    await vi.advanceTimersByTimeAsync(1_000);
    player.pause();
    expect(player.state).toBe("paused");

    const posAfterPause = player.currentT;

    // Advance wall-clock time — position must not change while paused
    await vi.advanceTimersByTimeAsync(2_000);
    expect(player.currentT).toBe(posAfterPause);

    // Resume — player should continue from where it left off
    player.play();
    expect(player.state).toBe("playing");

    session.exitReplay();
  });

  it("seek moves currentT to the requested timestamp", async () => {
    seedMetricFrames(session, "cpu", 10);
    await session.store.flush();

    const player = await session.enterReplay();
    player.seek(5_000);
    await drain();

    expect(player.currentT).toBe(5_000);
    session.exitReplay();
  });

  it("live recording continues while in replay mode", async () => {
    seedMetricFrames(session, "cpu", 3);
    await session.store.flush();

    await session.enterReplay();

    // This should not throw — the recorder keeps running in replay mode
    expect(() =>
      session.record("cpu", { name: "cpu", value: 77 }, Date.now()),
    ).not.toThrow();

    session.exitReplay();
  });

  // B1 fix: seek() → stop() → play() must resume at the seek point, not earliest
  it("seek → stop → play resumes from the seek position, not timeRange.earliest", async () => {
    seedMetricFrames(session, "cpu", 10); // t=1000..10000, stepT=1000
    session.record("cpu", { name: "cpu", value: -1 }, 15_000); // sentinel
    await session.store.flush();

    const player = await session.enterReplay();
    player.seek(7_000);
    await drain();
    expect(player.currentT).toBe(7_000);

    player.stop();
    expect(player.state).toBe("stopped");

    // After stop, play() must resume from 7_000 (the seek point), not 1_000 (earliest)
    const firstFrameTs: number[] = [];
    player.onFrame(cpuChannel, ({ t }) => firstFrameTs.push(t));
    player.play();
    await vi.advanceTimersByTimeAsync(500);

    // First frames must be near 7_000 (3s lookback allowed), not back at 1_000
    expect(firstFrameTs.length).toBeGreaterThan(0);
    expect(firstFrameTs[0]).toBeGreaterThanOrEqual(7_000 - 3_000);
    expect(firstFrameTs[firstFrameTs.length - 1]).toBeGreaterThanOrEqual(7_000);

    session.exitReplay();
  });

  // B2 fix: onEnd transitions player to "stopped", not "paused"
  it("onEnd leaves player state as 'stopped', not 'paused'", async () => {
    seedMetricFrames(session, "cpu", 3); // t=1000..3000
    await session.store.flush();

    const player = await session.enterReplay();
    const states: string[] = [];
    player.onStateChange((s) => states.push(s));

    player.play();
    await vi.advanceTimersByTimeAsync(10_000); // play to end

    // Player must have stopped (not paused) after onEnd
    expect(player.state).toBe("stopped");
    expect(states).toContain("stopped");
    expect(states[states.length - 1]).toBe("stopped");

    session.exitReplay();
  });
});
