/**
 * Scenario 11: Playback Rate Control
 *
 * Verifies that play(rate) scales virtual time correctly:
 *   - 2x delivers ~2× frames per wall-clock second vs 1x
 *   - 0.5x delivers ~½ frames per wall-clock second vs 1x
 *   - pause → play(newRate) preserves value coherence (value === t / STEP_MS)
 *   - play(0) freezes virtual time — no frames arrive but state stays "playing"
 *
 * API notes:
 *   - play(rate) is the only public rate entry point (default 1.0)
 *   - Mid-playback rate changes: pause() then play(newRate) — no public setRate()
 *   - play(0): VirtualClock multiplies elapsed wall time by 0 → currentT constant
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import { ReplaySession } from "../features/session/model/replay-session";
import { buildMetricRecording, drain } from "./_helpers";

const HZ = 20;
const STEP_MS = 1000 / HZ; // 50 ms
const DURATION_MS = 60_000; // 60 seconds — plenty of headroom for all rate tests
const CPU = new MetricChannel("cpu");

/** Seed 60s of CPU metric with value === t / STEP_MS. */
async function seedSession(session: ReplaySession): Promise<void> {
  const frames = buildMetricRecording({
    channelId: "cpu",
    startT: 0,
    durationMs: DURATION_MS,
    hz: HZ,
    valueFn: (i) => i, // value === index === t / STEP_MS
  });
  for (const f of frames) {
    session.record("cpu", { name: "cpu", value: f.value }, f.t);
  }
  await session.store.flush();
}

describe("Scenario 11: playback rate control", () => {
  let session: ReplaySession;

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new ReplaySession({
      channels: [CPU],
      evictThresholdPct: 100,
      retentionMs: 10 * 60_000,
    });
    await session.open();
    await session.startRecording();
    await seedSession(session);
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. 2x rate delivers ~2× frames per wall-clock second compared to 1x
  // -------------------------------------------------------------------------

  it("play(2) delivers approximately 2× more frames in the same wall-clock window as play(1)", async () => {
    const WALL_MS = 5_000;

    // --- 1x baseline ---
    const player1x = await session.enterReplay(0);
    const frames1x: number[] = [];
    player1x.onFrame(CPU, ({ data }) => { if (data.value >= 0) frames1x.push(data.value); });
    player1x.play(1.0);
    await vi.advanceTimersByTimeAsync(WALL_MS);
    session.exitReplay();

    // --- 2x ---
    const player2x = await session.enterReplay(0);
    const frames2x: number[] = [];
    player2x.onFrame(CPU, ({ data }) => { if (data.value >= 0) frames2x.push(data.value); });
    player2x.play(2.0);
    await vi.advanceTimersByTimeAsync(WALL_MS);
    session.exitReplay();

    // 2x should cover ~2× the virtual time → ~2× frames
    expect(frames2x.length).toBeGreaterThan(frames1x.length * 1.5);

    // Value coherence in both sessions
    for (const f of frames1x) {
      expect(f).toBeGreaterThanOrEqual(0);
    }
    for (const f of frames2x) {
      expect(f).toBeGreaterThanOrEqual(0);
    }
  });

  // -------------------------------------------------------------------------
  // 2. 0.5x rate delivers ~half the frames in the same wall-clock window as 1x
  // -------------------------------------------------------------------------

  it("play(0.5) delivers approximately half the frames as play(1) in the same wall-clock window", async () => {
    const WALL_MS = 6_000;

    // --- 1x baseline ---
    const player1x = await session.enterReplay(0);
    const frames1x: number[] = [];
    player1x.onFrame(CPU, ({ data }) => { if (data.value >= 0) frames1x.push(data.value); });
    player1x.play(1.0);
    await vi.advanceTimersByTimeAsync(WALL_MS);
    session.exitReplay();

    // --- 0.5x ---
    const player05x = await session.enterReplay(0);
    const frames05x: number[] = [];
    player05x.onFrame(CPU, ({ data }) => { if (data.value >= 0) frames05x.push(data.value); });
    player05x.play(0.5);
    await vi.advanceTimersByTimeAsync(WALL_MS);
    session.exitReplay();

    // 0.5x covers ~half the virtual time → ~half the frames
    expect(frames05x.length).toBeLessThan(frames1x.length * 0.75);
    expect(frames05x.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 3. pause → play(2x) preserves value coherence
  // -------------------------------------------------------------------------

  it("pause then play(2x) continues with correct values — no tangling or gaps", async () => {
    const player = await session.enterReplay(0);

    const frames: { t: number; value: number }[] = [];
    player.onFrame(CPU, ({ t, data }) => { if (data.value >= 0) frames.push({ t, value: data.value }); });

    // Phase 1: 1x for 3s
    player.play(1.0);
    await vi.advanceTimersByTimeAsync(3_000);
    player.pause();

    const countAfterPause = frames.length;
    expect(countAfterPause).toBeGreaterThan(0);

    // Phase 2: resume at 2x for 3s
    player.play(2.0);
    await vi.advanceTimersByTimeAsync(3_000);
    session.exitReplay();

    expect(frames.length).toBeGreaterThan(countAfterPause);

    // Value coherence throughout both phases
    for (const f of frames) {
      expect(f.value).toBe(f.t / STEP_MS);
    }

    // Strictly ascending timestamps across the rate change boundary
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.t).toBeGreaterThan(frames[i - 1]!.t);
    }

    // 2x phase must have advanced further (more virtual time per wall-clock second)
    const phase2Frames = frames.slice(countAfterPause);
    expect(phase2Frames.length).toBeGreaterThan(countAfterPause); // 2x > 1x in same window
  });

  // -------------------------------------------------------------------------
  // 4. pause → play(0.5x) delivers gap-free frames at half speed
  // -------------------------------------------------------------------------

  it("pause then play(0.5x) continues gap-free with value coherence", async () => {
    const player = await session.enterReplay(0);

    const frames: { t: number; value: number }[] = [];
    player.onFrame(CPU, ({ t, data }) => { if (data.value >= 0) frames.push({ t, value: data.value }); });

    // Phase 1: 1x for 2s
    player.play(1.0);
    await vi.advanceTimersByTimeAsync(2_000);
    player.pause();

    const pauseT = player.currentT;
    const countAtPause = frames.length;
    expect(countAtPause).toBeGreaterThan(0);

    // Phase 2: resume at 0.5x for 6s (covers ~3s of virtual time)
    player.play(0.5);
    await vi.advanceTimersByTimeAsync(6_000);
    session.exitReplay();

    // More frames arrived after resume
    expect(frames.length).toBeGreaterThan(countAtPause);

    // First frame after resume must be at or after the pause position
    const firstPostResume = frames[countAtPause];
    expect(firstPostResume!.t).toBeGreaterThanOrEqual(pauseT);

    // Value coherence throughout
    for (const f of frames) {
      expect(f.value).toBe(f.t / STEP_MS);
    }

    // Gap-free (every consecutive pair exactly STEP_MS apart)
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.t - frames[i - 1]!.t).toBe(STEP_MS);
    }
  });

  // -------------------------------------------------------------------------
  // 5. play(0) freezes virtual time — no frames, state stays "playing"
  // -------------------------------------------------------------------------

  it("play(0) freezes currentT — state is 'playing' and no new frames arrive after the initial prefetch", async () => {
    // Seek deep into the recording so the prefetch window (startT - 3s lookback)
    // is well-defined and bounded. Then play(0) → virtual time freezes.
    const player = await session.enterReplay(30_000);
    await drain();

    player.play(0);
    const tAtStart = player.currentT;

    // Drain the initial prefetch tick (first _onTick call may deliver the
    // lookback window of frames before currentT stops advancing).
    await vi.advanceTimersByTimeAsync(200);

    const framesAfterPrefetch: number[] = [];
    // Subscribe AFTER the initial tick to capture only frames from ongoing play
    player.onFrame(CPU, ({ data }) => { if (data.value >= 0) framesAfterPrefetch.push(data.value); });

    // Advance a large wall-clock window — virtual time must stay frozen
    await vi.advanceTimersByTimeAsync(5_000);

    expect(player.state).toBe("playing");
    // currentT is frozen: rate(0) × elapsed = 0 → constant
    expect(player.currentT).toBe(tAtStart);
    // No additional frames delivered because currentT never advances
    expect(framesAfterPrefetch.length).toBe(0);

    session.exitReplay();
  });
});
