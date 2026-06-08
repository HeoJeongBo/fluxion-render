/**
 * Scenario 12: clearRecording Lifecycle + Concurrent Record & Replay
 *
 * Two complementary gaps closed here:
 *
 * A. clearRecording() full cycle — 05 only checked getTimeRange null; this
 *    scenario verifies the complete re-use pattern: clear → fresh recording →
 *    replay sees only new data, not the erased frames.
 *
 * B. Concurrent record + replay — 01 verifies record() is still called during
 *    replay mode, but does NOT check that those frames are actually persisted
 *    in the store and queryable afterward. This scenario closes that gap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import { ReplaySession } from "../features/session/model/replay-session";
import { drain, seedMetricFrames } from "./_helpers";

const CPU = new MetricChannel("cpu");
const TEMP = new MetricChannel("temp");

describe("Scenario 12-A: clearRecording lifecycle", () => {
  let session: ReplaySession;

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new ReplaySession({ channels: [CPU, TEMP] });
    await session.open();
    await session.startRecording();
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // A1. clearRecording → fresh record → replay sees only new frames
  // -------------------------------------------------------------------------

  it("A1: replay after clearRecording contains only the new recording, not the old one", async () => {
    // Phase 1: record old data (t=1000..10000)
    seedMetricFrames(session, "cpu", 10, 1_000, 1_000);
    await session.store.flush();

    const rangeBefore = await session.getTimeRange();
    expect(rangeBefore!.earliest).toBe(1_000);
    expect(rangeBefore!.latest).toBe(10_000);

    // Clear everything
    await session.clearRecording();
    const rangeAfterClear = await session.getTimeRange();
    expect(rangeAfterClear).toBeNull();

    // Phase 2: record fresh data starting at a completely different offset
    // Add a sentinel frame beyond the real data so onEnd doesn't fire before
    // all 5 real frames are delivered (timeRange.latest must exceed last real t).
    seedMetricFrames(session, "cpu", 5, 50_000, 1_000);
    session.record("cpu", { name: "cpu", value: -1 }, 90_000); // sentinel
    await session.store.flush();

    const rangeAfterFresh = await session.getTimeRange();
    expect(rangeAfterFresh!.earliest).toBe(50_000);
    expect(rangeAfterFresh!.latest).toBe(90_000); // sentinel extends range

    // Replay must only deliver fresh frames, no trace of old 1k–10k data
    const player = await session.enterReplay();
    const values: number[] = [];
    const timestamps: number[] = [];
    player.onFrame(CPU, ({ t, data }) => {
      if (data.value >= 0) { values.push(data.value); timestamps.push(t); }
    });

    player.play();
    await vi.advanceTimersByTimeAsync(60_000);
    session.exitReplay();

    // Only the 5 fresh frames (values 0–4), none from the old recording
    expect(values.length).toBe(5);
    for (const t of timestamps) {
      expect(t).toBeGreaterThanOrEqual(50_000);
    }
    // Old data (t < 50k) must be absent
    expect(timestamps.some((t) => t < 50_000)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // A2. clearRecording while replay is active — player is disposed
  // -------------------------------------------------------------------------

  it("A2: clearRecording does NOT auto-dispose an active player — caller must exitReplay first", async () => {
    // clearRecording() only stops+restarts the recorder and wipes IDB.
    // It does NOT touch _player or _mode — that is intentional (the player
    // can still be scrubbing while the buffer is reset behind the scenes).
    seedMetricFrames(session, "cpu", 5, 1_000, 1_000);
    await session.store.flush();

    const player = await session.enterReplay();
    expect(session.mode).toBe("replay");
    expect(session.player).toBe(player);

    await session.clearRecording();

    // mode and player reference are unchanged — clearRecording is store-only
    expect(session.mode).toBe("replay");
    expect(session.player).toBe(player);

    // Store is empty after clear
    const rangeAfterClear = await session.getTimeRange();
    expect(rangeAfterClear).toBeNull();

    // Clean up
    session.exitReplay();
    expect(session.mode).toBe("live");
  });

  // -------------------------------------------------------------------------
  // A3. Multi-channel: clearRecording → re-record → channel isolation intact
  // -------------------------------------------------------------------------

  it("A3: after clearRecording and re-recording, channel isolation is preserved", async () => {
    // Phase 1: record both channels
    seedMetricFrames(session, "cpu", 5, 1_000, 1_000);
    seedMetricFrames(session, "temp", 5, 1_000, 1_000);
    await session.store.flush();

    await session.clearRecording();

    // Phase 2: re-record with distinct values per channel.
    // Add a sentinel tick beyond the real frames so timeRange.latest is large
    // enough that onEnd doesn't fire before all 5 real frames are delivered.
    for (let i = 0; i < 5; i++) {
      const t = 100_000 + i * 1_000;
      session.record("cpu", { name: "cpu", value: i * 10 }, t);
      session.record("temp", { name: "temp", value: i * 10 + 1 }, t);
    }
    // Sentinel at 140_000 (40s gap) keeps timeRange.latest far from last real frame
    session.record("cpu", { name: "cpu", value: -1 }, 140_000);
    session.record("temp", { name: "temp", value: -1 }, 140_000);
    await session.store.flush();

    const player = await session.enterReplay();
    const cpuValues: number[] = [];
    const tempValues: number[] = [];

    player.onFrame(CPU, ({ data }) => { if (data.value >= 0) cpuValues.push(data.value); });
    player.onFrame(TEMP, ({ data }) => { if (data.value >= 0) tempValues.push(data.value); });

    player.play();
    await vi.advanceTimersByTimeAsync(60_000);
    session.exitReplay();

    // Each channel receives exactly 5 fresh frames
    expect(cpuValues).toHaveLength(5);
    expect(tempValues).toHaveLength(5);

    // CPU gets multiples of 10; TEMP gets +1
    expect(cpuValues.every((v) => v % 10 === 0)).toBe(true);
    expect(tempValues.every((v) => v % 10 === 1)).toBe(true);

    // No cross-contamination
    const cpuSet = new Set(cpuValues);
    expect(tempValues.some((v) => cpuSet.has(v))).toBe(false);
  });
});

describe("Scenario 12-B: concurrent record + replay", () => {
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

  // -------------------------------------------------------------------------
  // B4. Frames recorded during replay are flushed to the store
  // -------------------------------------------------------------------------

  it("B4: frames recorded while in replay mode are persisted in the store", async () => {
    // Seed initial recording
    seedMetricFrames(session, "cpu", 5, 1_000, 1_000);
    await session.store.flush();

    // Enter replay
    const player = await session.enterReplay();
    expect(session.mode).toBe("replay");

    // Record new frames while in replay mode
    session.record("cpu", { name: "cpu", value: 999 }, 100_000);
    session.record("cpu", { name: "cpu", value: 1000 }, 101_000);
    await session.store.flush();

    // The store must now contain the new frames
    const allFrames = await session.store.getFramesByChannel(CPU, 0, 200_000);
    const newFrames = allFrames.filter((f) => f.t >= 100_000);
    expect(newFrames.length).toBeGreaterThanOrEqual(2);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // B5. Frames recorded during replay are replayable after exitReplay
  // -------------------------------------------------------------------------

  it("B5: frames recorded during replay can be replayed after exitReplay", async () => {
    // Seed initial recording
    seedMetricFrames(session, "cpu", 3, 1_000, 1_000);
    await session.store.flush();

    // Enter replay, record new frames concurrently at distinct future timestamps
    const _player = await session.enterReplay();
    session.record("cpu", { name: "cpu", value: 77 }, 200_000);
    session.record("cpu", { name: "cpu", value: 88 }, 200_050); // STEP_MS = 50
    // Sentinel: keeps timeRange.latest far enough so onEnd doesn't fire before both frames
    session.record("cpu", { name: "cpu", value: -1 }, 250_000);
    await session.store.flush();

    // Exit replay and start a fresh replay session seeking to the new frames
    session.exitReplay();
    expect(session.mode).toBe("live");

    const player2 = await session.enterReplay(200_000);
    await drain();

    const values: number[] = [];
    player2.onFrame(CPU, ({ data }) => { if (data.value >= 0) values.push(data.value); });

    player2.play();
    await vi.advanceTimersByTimeAsync(15_000);
    session.exitReplay();

    // The frames recorded during replay must be playable now
    expect(values).toContain(77);
    expect(values).toContain(88);
  });

  // -------------------------------------------------------------------------
  // B6. getTimeRange.latest advances as new frames are recorded during replay
  // -------------------------------------------------------------------------

  it("B6: getTimeRange.latest advances while recording during replay mode", async () => {
    // Seed initial recording up to t=5000
    seedMetricFrames(session, "cpu", 5, 1_000, 1_000);
    await session.store.flush();

    const rangeBefore = await session.getTimeRange();
    expect(rangeBefore!.latest).toBe(5_000);

    // Enter replay
    await session.enterReplay();

    // Record frames at a future timestamp and flush
    session.record("cpu", { name: "cpu", value: 42 }, 300_000);
    await session.store.flush();

    const rangeAfter = await session.getTimeRange();
    // live edge must have advanced past the initial 5000
    expect(rangeAfter!.latest).toBeGreaterThan(5_000);
    expect(rangeAfter!.latest).toBe(300_000);

    session.exitReplay();
  });
});
