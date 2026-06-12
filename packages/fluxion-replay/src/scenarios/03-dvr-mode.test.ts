/**
 * Scenario 03: DVR Mode
 *
 * Simulates the "time-travel DVR" use-case: the user is watching a live feed,
 * hits pause/rewind, scrubs to any point in the recording, and eventually
 * returns to live. This is the primary value-proposition of the library.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import { ReplayPlayer } from "../features/player/model/replay-player";
import { ReplaySession } from "../features/session/model/replay-session";
import { buildMetricRecording, drain } from "./_helpers";

const CPU = new MetricChannel("cpu");

/** Seed a session with `durationMs` of CPU metric at 20 Hz. */
async function seedSession(session: ReplaySession, durationMs = 60_000): Promise<void> {
  const frames = buildMetricRecording({
    channelId: "cpu",
    startT: 0,
    durationMs,
    hz: 20,
    valueFn: (i) => Math.sin(i * 0.1) * 50 + 50,
  });
  for (const f of frames) {
    session.record("cpu", { name: "cpu", value: f.value }, f.t);
  }
  await session.store.flush();
}

describe("Scenario 03: DVR mode", () => {
  let session: ReplaySession;

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new ReplaySession({ channels: [CPU] });
    await session.open();
    await session.startRecording();
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  it("enterReplay at earliest returns a player positioned at the start", async () => {
    await seedSession(session);

    const range = await session.getTimeRange();
    const player = await session.enterReplay(range!.earliest);
    await drain();

    expect(player.currentT).toBe(range!.earliest);
    expect(player).toBeInstanceOf(ReplayPlayer);
    session.exitReplay();
  });

  it("enterReplay with a mid-point timestamp seeks to that position", async () => {
    await seedSession(session);

    const range = await session.getTimeRange();
    const midT = range!.earliest + Math.floor((range!.latest - range!.earliest) / 2);
    const player = await session.enterReplay(midT);
    await drain();

    expect(player.currentT).toBe(midT);
    session.exitReplay();
  });

  it("player.seek fires onSeek callback with the clamped timestamp", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const seekTs: number[] = [];
    player.onSeek((t) => seekTs.push(t));

    player.seek(30_000);
    await drain();

    expect(seekTs).toHaveLength(1);
    expect(seekTs[0]).toBe(30_000);
    session.exitReplay();
  });

  it("onEnd fires after playing to the end of the recording", async () => {
    await seedSession(session, 3_000); // short 3-second recording

    const player = await session.enterReplay();
    let ended = false;
    player.onEnd(() => {
      ended = true;
    });
    player.play();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(ended).toBe(true);
    session.exitReplay();
  });

  it("re-entering replay disposes the previous player", async () => {
    await seedSession(session);

    const player1 = await session.enterReplay(0);
    const disposeSpy = vi.spyOn(player1, "dispose");

    // Enter again — the old player must be disposed
    await session.enterReplay(0);

    expect(disposeSpy).toHaveBeenCalledOnce();
    session.exitReplay();
  });

  it("getTimeRange matches the IDB bounds after recording", async () => {
    session.record("cpu", { name: "cpu", value: 1 }, 1_000);
    session.record("cpu", { name: "cpu", value: 2 }, 8_000);
    await session.store.flush();

    const range = await session.getTimeRange();
    expect(range!.earliest).toBe(1_000);
    expect(range!.latest).toBe(8_000);
  });

  it("player timeRange reflects the enterReplay time bounds", async () => {
    session.record("cpu", { name: "cpu", value: 1 }, 1_000);
    session.record("cpu", { name: "cpu", value: 2 }, 5_000);
    await session.store.flush();

    const player = await session.enterReplay(undefined, {
      timeRange: { earliest: 2_000, latest: 4_000 },
    });

    expect(player.timeRange.earliest).toBe(2_000);
    expect(player.timeRange.latest).toBe(4_000);
    session.exitReplay();
  });

  it("seek clamps to the player timeRange boundaries", async () => {
    session.record("cpu", { name: "cpu", value: 1 }, 1_000);
    session.record("cpu", { name: "cpu", value: 2 }, 10_000);
    await session.store.flush();

    const player = await session.enterReplay();
    const range = player.timeRange;

    player.seek(range.earliest - 999_999);
    await drain();
    expect(player.currentT).toBe(range.earliest);

    player.seek(range.latest + 999_999);
    await drain();
    expect(player.currentT).toBe(range.latest);

    session.exitReplay();
  });

  it("onStateChange fires on play / pause / stop transitions", async () => {
    await seedSession(session, 5_000);
    const player = await session.enterReplay();

    const states: string[] = [];
    player.onStateChange((s) => states.push(s));

    player.play();
    player.pause();
    player.stop();

    expect(states).toContain("playing");
    expect(states).toContain("paused");
    expect(states).toContain("stopped");
    session.exitReplay();
  });

  it("frames received during replay are in ascending timestamp order", async () => {
    await seedSession(session, 5_000);
    const player = await session.enterReplay();

    const ts: number[] = [];
    player.onFrame(({ t }) => ts.push(t));
    player.play();

    await vi.advanceTimersByTimeAsync(10_000);

    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
    }
    session.exitReplay();
  });
});
