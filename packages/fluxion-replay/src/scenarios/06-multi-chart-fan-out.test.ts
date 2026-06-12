/**
 * Scenario 06: Multi-Chart Fan-Out
 *
 * Mirrors the stream-worker-demo pattern: a single broadcast source records
 * N channels at the same timestamp each tick, and N independent chart
 * subscribers listen to the same ReplayPlayer simultaneously.
 *
 * Key invariants under test:
 *   - Single player fans out to multiple typed onFrame(channel, cb) listeners
 *   - Each listener receives only its own channel's frames (no cross-contamination)
 *   - Same-tick frames share identical timestamps across all channels
 *   - seek() repositions all channels atomically
 *   - Listener cleanup is channel-scoped (removing one doesn't affect others)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import { ReplaySession } from "../features/session/model/replay-session";
import { drain } from "./_helpers";

const ch0 = new MetricChannel("sensor-0");
const ch1 = new MetricChannel("sensor-1");
const ch2 = new MetricChannel("sensor-2");

/** Simulate one broadcast packet: record all 3 channels at the same timestamp. */
function seedBroadcastTick(
  session: ReplaySession,
  t: number,
  values: [number, number, number],
): void {
  session.record("sensor-0", { name: "sensor-0", value: values[0] }, t);
  session.record("sensor-1", { name: "sensor-1", value: values[1] }, t);
  session.record("sensor-2", { name: "sensor-2", value: values[2] }, t);
}

/**
 * Seed 5 broadcast ticks (t=1000..5000) with distinct values per channel,
 * plus a sentinel tick at t=9000 (value=-1) to push timeRange.latest far
 * enough that real frames are delivered before onEnd fires.
 */
async function seedSession(session: ReplaySession): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const t = 1_000 + i * 1_000;
    seedBroadcastTick(session, t, [i * 10, i * 10 + 1, i * 10 + 2]);
  }
  // Sentinel: extends timeRange.latest to 9000 so onEnd doesn't fire early
  seedBroadcastTick(session, 9_000, [-1, -1, -1]);
  await session.store.flush();
}

describe("Scenario 06: multi-chart fan-out", () => {
  let session: ReplaySession;

  beforeEach(async () => {
    vi.useFakeTimers();
    session = new ReplaySession({ channels: [ch0, ch1, ch2] });
    await session.open();
    await session.startRecording();
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Storage
  // -------------------------------------------------------------------------

  it("all N channels are stored at each broadcast tick", async () => {
    await seedSession(session);

    const ch0Frames = await session.store.getFramesByChannel(ch0, 0, 10_000);
    const ch1Frames = await session.store.getFramesByChannel(ch1, 0, 10_000);
    const ch2Frames = await session.store.getFramesByChannel(ch2, 0, 10_000);

    // 5 real ticks + 1 sentinel each
    expect(ch0Frames).toHaveLength(6);
    expect(ch1Frames).toHaveLength(6);
    expect(ch2Frames).toHaveLength(6);

    // Timestamps match across channels for each real tick
    for (let i = 0; i < 5; i++) {
      expect(ch0Frames[i].t).toBe(ch1Frames[i].t);
      expect(ch1Frames[i].t).toBe(ch2Frames[i].t);
    }

    const range = await session.getTimeRange();
    expect(range!.earliest).toBe(1_000);
    expect(range!.latest).toBe(9_000);
  });

  // -------------------------------------------------------------------------
  // 2. Fan-out: one player, multiple simultaneous subscribers
  // -------------------------------------------------------------------------

  it("single player fans out to N listeners simultaneously", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Values: number[] = [];
    const ch1Values: number[] = [];
    const ch2Values: number[] = [];

    player.onFrame(ch0, ({ data }) => {
      if (data.value >= 0) ch0Values.push(data.value);
    });
    player.onFrame(ch1, ({ data }) => {
      if (data.value >= 0) ch1Values.push(data.value);
    });
    player.onFrame(ch2, ({ data }) => {
      if (data.value >= 0) ch2Values.push(data.value);
    });

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(ch0Values).toHaveLength(5);
    expect(ch1Values).toHaveLength(5);
    expect(ch2Values).toHaveLength(5);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 3. Isolation: no cross-channel contamination
  // -------------------------------------------------------------------------

  it("each channel listener receives only its own channel's frames", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Values: number[] = [];
    const ch1Values: number[] = [];
    const ch2Values: number[] = [];

    // ch0 gets multiples of 10 (0,10,20,30,40), ch1 gets +1, ch2 gets +2
    player.onFrame(ch0, ({ data }) => {
      if (data.value >= 0) ch0Values.push(data.value);
    });
    player.onFrame(ch1, ({ data }) => {
      if (data.value >= 0) ch1Values.push(data.value);
    });
    player.onFrame(ch2, ({ data }) => {
      if (data.value >= 0) ch2Values.push(data.value);
    });

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    // ch0: 0,10,20,30,40
    expect(ch0Values.every((v) => v % 10 === 0)).toBe(true);
    // ch1: 1,11,21,31,41
    expect(ch1Values.every((v) => v % 10 === 1)).toBe(true);
    // ch2: 2,12,22,32,42
    expect(ch2Values.every((v) => v % 10 === 2)).toBe(true);

    // No value from ch0 appears in ch1 or ch2
    const ch0Set = new Set(ch0Values);
    expect(ch1Values.some((v) => ch0Set.has(v))).toBe(false);
    expect(ch2Values.some((v) => ch0Set.has(v))).toBe(false);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 4. Time-sync: same broadcast tick → same t across all channels
  // -------------------------------------------------------------------------

  it("all charts receive the same timestamp for each broadcast tick", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Ts: number[] = [];
    const ch1Ts: number[] = [];
    const ch2Ts: number[] = [];

    player.onFrame(ch0, ({ t, data }) => {
      if (data.value >= 0) ch0Ts.push(t);
    });
    player.onFrame(ch1, ({ t, data }) => {
      if (data.value >= 0) ch1Ts.push(t);
    });
    player.onFrame(ch2, ({ t, data }) => {
      if (data.value >= 0) ch2Ts.push(t);
    });

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(ch0Ts).toHaveLength(5);
    expect(ch1Ts).toHaveLength(5);
    expect(ch2Ts).toHaveLength(5);

    for (let i = 0; i < 5; i++) {
      expect(ch0Ts[i]).toBe(ch1Ts[i]);
      expect(ch1Ts[i]).toBe(ch2Ts[i]);
    }

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 5. seek(): all channels reposition together
  // -------------------------------------------------------------------------

  it("seek repositions all channels — playback advances forward from seek point", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    player.seek(3_000);
    await drain();
    expect(player.currentT).toBe(3_000);

    const ch0Ts: number[] = [];
    const ch1Ts: number[] = [];
    const ch2Ts: number[] = [];

    player.onFrame(ch0, ({ t, data }) => {
      if (data.value >= 0) ch0Ts.push(t);
    });
    player.onFrame(ch1, ({ t, data }) => {
      if (data.value >= 0) ch1Ts.push(t);
    });
    player.onFrame(ch2, ({ t, data }) => {
      if (data.value >= 0) ch2Ts.push(t);
    });

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    // The player includes a lookback window (up to 3s before seek) for keyframe
    // recovery. Frames in [seekT - lookback, seekT] may be delivered on the
    // first tick. What matters is that playback advances forward from seekT:
    // frames AFTER the seek point must arrive on all three channels.
    expect(ch0Ts).toContain(3_000);
    expect(ch1Ts).toContain(3_000);
    expect(ch2Ts).toContain(3_000);
    expect(ch0Ts).toContain(4_000);
    expect(ch1Ts).toContain(4_000);
    expect(ch2Ts).toContain(4_000);
    expect(ch0Ts).toContain(5_000);
    expect(ch1Ts).toContain(5_000);
    expect(ch2Ts).toContain(5_000);

    // currentT advanced past the seek point
    expect(player.currentT).toBeGreaterThanOrEqual(3_000);

    // All channels are synchronized: same seek repositions all of them
    // (frames after seek arrive at matching indices across channels)
    const ch0Post = ch0Ts.filter((t) => t >= 3_000).sort((a, b) => a - b);
    const ch1Post = ch1Ts.filter((t) => t >= 3_000).sort((a, b) => a - b);
    const ch2Post = ch2Ts.filter((t) => t >= 3_000).sort((a, b) => a - b);
    expect(ch0Post).toEqual(ch1Post);
    expect(ch1Post).toEqual(ch2Post);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 6. Frame ordering: ascending timestamp per channel
  // -------------------------------------------------------------------------

  it("frames arrive in ascending timestamp order per channel", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Ts: number[] = [];
    const ch1Ts: number[] = [];
    const ch2Ts: number[] = [];

    player.onFrame(ch0, ({ t }) => ch0Ts.push(t));
    player.onFrame(ch1, ({ t }) => ch1Ts.push(t));
    player.onFrame(ch2, ({ t }) => ch2Ts.push(t));

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    for (const ts of [ch0Ts, ch1Ts, ch2Ts]) {
      for (let i = 1; i < ts.length; i++) {
        expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
      }
    }

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 7. onEnd fires exactly once after all channels finish
  // -------------------------------------------------------------------------

  it("onEnd fires exactly once after all channels finish", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Values: number[] = [];
    const ch1Values: number[] = [];
    const ch2Values: number[] = [];
    let endCount = 0;

    player.onFrame(ch0, ({ data }) => {
      if (data.value >= 0) ch0Values.push(data.value);
    });
    player.onFrame(ch1, ({ data }) => {
      if (data.value >= 0) ch1Values.push(data.value);
    });
    player.onFrame(ch2, ({ data }) => {
      if (data.value >= 0) ch2Values.push(data.value);
    });
    player.onEnd(() => {
      endCount++;
    });

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(endCount).toBe(1);
    // All real frames delivered before onEnd
    expect(ch0Values).toHaveLength(5);
    expect(ch1Values).toHaveLength(5);
    expect(ch2Values).toHaveLength(5);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 8. Listener cleanup: removing one channel's listener leaves others intact
  // -------------------------------------------------------------------------

  it("removing one channel listener leaves others unaffected", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Values: number[] = [];
    const ch1Values: number[] = [];
    const ch2Values: number[] = [];

    player.onFrame(ch0, ({ data }) => {
      if (data.value >= 0) ch0Values.push(data.value);
    });
    player.onFrame(ch1, ({ data }) => {
      if (data.value >= 0) ch1Values.push(data.value);
    });
    const offCh2 = player.onFrame(ch2, ({ data }) => {
      if (data.value >= 0) ch2Values.push(data.value);
    });

    // Unsubscribe ch2 before play starts
    offCh2();

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    // ch0 and ch1 receive all 5 real frames
    expect(ch0Values).toHaveLength(5);
    expect(ch1Values).toHaveLength(5);
    // ch2 was removed before any frame arrived
    expect(ch2Values).toHaveLength(0);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 9. Edge: sparse channel — fewer frames on one channel doesn't stall others
  // -------------------------------------------------------------------------

  it("sparse channel (fewer frames) does not stall other channels", async () => {
    // ch0 and ch1: 5 frames; ch2: only 2 frames; sentinel at t=9000 for all
    for (let i = 0; i < 5; i++) {
      const t = 1_000 + i * 1_000;
      session.record("sensor-0", { name: "sensor-0", value: i * 10 }, t);
      session.record("sensor-1", { name: "sensor-1", value: i * 10 + 1 }, t);
      if (i < 2) {
        session.record("sensor-2", { name: "sensor-2", value: i * 10 + 2 }, t);
      }
    }
    seedBroadcastTick(session, 9_000, [-1, -1, -1]);
    await session.store.flush();

    const player = await session.enterReplay();

    const ch0Values: number[] = [];
    const ch1Values: number[] = [];
    const ch2Values: number[] = [];
    let endCount = 0;

    player.onFrame(ch0, ({ data }) => {
      if (data.value >= 0) ch0Values.push(data.value);
    });
    player.onFrame(ch1, ({ data }) => {
      if (data.value >= 0) ch1Values.push(data.value);
    });
    player.onFrame(ch2, ({ data }) => {
      if (data.value >= 0) ch2Values.push(data.value);
    });
    player.onEnd(() => {
      endCount++;
    });

    player.play();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(ch0Values).toHaveLength(5);
    expect(ch1Values).toHaveLength(5);
    expect(ch2Values).toHaveLength(2);
    // onEnd fires normally despite channel count mismatch
    expect(endCount).toBe(1);

    session.exitReplay();
  });

  // -------------------------------------------------------------------------
  // 10. Edge: partial unsubscribe mid-playback
  // -------------------------------------------------------------------------

  it("unsubscribing mid-playback stops that channel only", async () => {
    await seedSession(session);
    const player = await session.enterReplay();

    const ch0Values: number[] = [];
    const ch1Values: number[] = [];
    const ch2Values: number[] = [];

    player.onFrame(ch0, ({ data }) => {
      if (data.value >= 0) ch0Values.push(data.value);
    });
    const offCh1 = player.onFrame(ch1, ({ data }) => {
      if (data.value >= 0) ch1Values.push(data.value);
    });
    player.onFrame(ch2, ({ data }) => {
      if (data.value >= 0) ch2Values.push(data.value);
    });

    player.play();
    // Advance past the first 2 ticks (t=1000, t=2000)
    await vi.advanceTimersByTimeAsync(2_500);

    const ch1CountAtUnsubscribe = ch1Values.length;
    expect(ch1CountAtUnsubscribe).toBeGreaterThan(0);

    // Unsubscribe ch1 between timer advances (not inside a listener callback)
    offCh1();

    // Advance to end
    await vi.advanceTimersByTimeAsync(10_000);

    // ch0 and ch2 reach all 5 frames
    expect(ch0Values).toHaveLength(5);
    expect(ch2Values).toHaveLength(5);
    // ch1 stopped growing after unsubscribe
    expect(ch1Values.length).toBe(ch1CountAtUnsubscribe);

    session.exitReplay();
  });
});
