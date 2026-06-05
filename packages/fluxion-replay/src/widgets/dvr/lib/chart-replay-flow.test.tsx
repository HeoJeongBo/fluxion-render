import { act, renderHook } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import { useLiveTimeRange } from "../../live/lib/use-live-time-range";
import { useReplayPlayer } from "../../replay-timeline/lib/use-replay-player";
import { useReplaySession } from "../../replay-timeline/lib/use-replay-session";
import { useReplayDvr } from "./use-replay-dvr";

/**
 * End-to-end coverage for the exact hook composition chart-replay.tsx uses:
 *
 *   useReplaySession → useLiveTimeRange → useReplayDvr → useReplayPlayer
 *
 * Plus the auto-record useEffect that wires them together. Catches
 * regressions where any single hook misbehaves only at the integration
 * level (Phase 8/9/10/11 were all bugs that single-hook tests missed).
 *
 * Note: uses REAL timers because the test exercises chained microtask /
 * IDB-flush / polling behaviour that fake timers race past. Keeps each
 * case short (~50ms) so the suite stays fast.
 */

const CHANNEL_ID = "signal";

function useChartReplayDemoFlow() {
  const { session, isReady, enterReplay, exitReplay, record } = useReplaySession({
    channels: [new MetricChannel(CHANNEL_ID)],
    retentionMs: 60_000,
  });
  const { timeRange: liveTimeRange, seed: seedTimeRange } = useLiveTimeRange(session);

  // Same shape as chart-replay.tsx — auto-record + seed + ref guard.
  const startedRef = useRef<typeof session | null>(null);
  useEffect(() => {
    if (!session || !isReady) return;
    if (startedRef.current === session) return;
    startedRef.current = session;
    let cancelled = false;
    void (async () => {
      await session.clearRecording();
      if (cancelled) return;
      await session.startRecording();
      if (cancelled) return;
      seedTimeRange({ earliest: Date.now(), latest: Date.now() });
    })();
    return () => { cancelled = true; };
  }, [session, isReady, seedTimeRange]);

  const dvr = useReplayDvr({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange,
    rate: 1,
  });
  const replayPlayer = useReplayPlayer(dvr.player);

  return { session, isReady, liveTimeRange, dvr, replayPlayer, record };
}

/** Drain a few microtasks + a short real-timer tick. */
async function settle(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  await Promise.resolve();
  await Promise.resolve();
}

describe("chart-replay full hook chain (Phase 11 sticky-cursor + frozen-edge e2e)", () => {
  // Real timers — see file-level note above.
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("on mount: live mode, useReplaySession ready, liveTimeRange seeded", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    expect(result.current.isReady).toBe(true);
    expect(result.current.dvr.isDvr).toBe(false);
    expect(result.current.liveTimeRange).not.toBeNull();
  });

  it("DVR entry: replayPlayer.currentT starts at enterT and advances forward (NOT stuck)", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    // Synthesise a wider liveTimeRange so enter has room to land.
    const baseT = Date.now();
    const session = result.current.session!;
    // Push some frames into the store so getTimeRange picks them up.
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });

    const liveLatest = result.current.liveTimeRange?.latest ?? baseT;
    const enterT = liveLatest - 1_500;
    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(10);
    });

    expect(result.current.dvr.isDvr).toBe(true);
    const tAtEntry = result.current.replayPlayer.currentT;
    // The bug-detecting assertion is "did it move forward at all?",
    // not pixel-exact. The real-timer + microtask flush around enter can
    // burn 1-2s before we observe; that's fine — we just need it to be ≥ enterT
    // and to keep moving when we wait more.
    expect(tAtEntry).toBeGreaterThanOrEqual(enterT);

    // Let real time pass — the cursor must MOVE FORWARD MORE.
    // Phase 14: cursor only updates every 1s wall (1-second snap), so wait
    // generously past the boundary to catch a guaranteed tick.
    await act(async () => { await settle(1_200); });
    const after = result.current.replayPlayer.currentT;
    expect(after).toBeGreaterThan(tAtEntry);

    result.current.dvr.exit();
  });

  it("DVR cursor keeps advancing across forced parent re-renders", async () => {
    const { result, rerender } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });
    const enterT = (result.current.liveTimeRange?.latest ?? baseT) - 2_500;
    await act(async () => {
      await result.current.dvr.enter(enterT);
      // Phase 14: settle past the 1s snap boundary so the cursor has
      // ticked at least once and `t1 > enterT` is provable.
      await settle(1_200);
    });
    const t1 = result.current.replayPlayer.currentT;
    expect(t1).toBeGreaterThan(enterT);

    // Force re-renders — Phase 11 sticky-cursor bug would snap back to enterT.
    for (let i = 0; i < 8; i++) rerender();
    expect(result.current.replayPlayer.currentT).toBeGreaterThanOrEqual(t1);

    // And keeps progressing — wait another full snap interval.
    await act(async () => { await settle(1_200); });
    expect(result.current.replayPlayer.currentT).toBeGreaterThan(t1);

    result.current.dvr.exit();
  });

  it("dvr.player reference is stable across re-renders (no spurious setPlayer)", async () => {
    const { result, rerender } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });
    const enterT = (result.current.liveTimeRange?.latest ?? baseT) - 1_000;
    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(10);
    });

    const playerRef = result.current.dvr.player;
    expect(playerRef).not.toBeNull();
    for (let i = 0; i < 10; i++) rerender();
    // Identical reference — if useState's setPlayer were called spuriously
    // during re-renders, this would fail.
    expect(result.current.dvr.player).toBe(playerRef);
    // useMemo'd effectiveTimeRange is also stable.
    const range1 = result.current.dvr.effectiveTimeRange;
    rerender();
    expect(result.current.dvr.effectiveTimeRange).toBe(range1);

    result.current.dvr.exit();
  });

  it("exit from DVR snaps back to live mode", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });
    await act(async () => {
      await result.current.dvr.enter((result.current.liveTimeRange?.latest ?? baseT) - 1_000);
      await settle(10);
    });
    expect(result.current.dvr.isDvr).toBe(true);

    await act(async () => {
      result.current.dvr.exit();
      await settle(10);
    });
    expect(result.current.dvr.isDvr).toBe(false);
    expect(result.current.dvr.player).toBeNull();
    expect(result.current.dvr.frozenLatest).toBeNull();
    // effectiveTimeRange falls back to liveTimeRange.
    expect(result.current.dvr.effectiveTimeRange).toEqual(result.current.liveTimeRange);
  });

  // ── Phase 12: live recording continues during DVR (chart-replay decoupled
  //     record() from the chart push so the store keeps growing).

  it("DVR mode: record() called during DVR adds frames to the store (no live freeze)", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const session = result.current.session!;
    const baseT = Date.now();
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });

    const liveLatestBefore = result.current.liveTimeRange?.latest ?? baseT;
    const enterT = liveLatestBefore - 1_500;
    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(10);
    });
    expect(result.current.dvr.isDvr).toBe(true);
    const frozenLatest = result.current.dvr.frozenLatest!;

    // Now record MORE frames during DVR — same pattern chart-replay's
    // useFluxionStream tick does post-Phase 12 (record runs regardless of
    // isLive). The store should keep growing.
    const newBaseT = liveLatestBefore + 100;
    for (let i = 0; i < 40; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: 100 + i }, newBaseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });

    // 1) Store actually got the new frames.
    const range = await session.getTimeRange();
    expect(range).not.toBeNull();
    expect(range!.latest).toBeGreaterThan(liveLatestBefore);

    // 2) scrubber upper bound stays frozen for the duration of DVR.
    expect(result.current.dvr.effectiveTimeRange!.latest).toBe(frozenLatest);

    result.current.dvr.exit();
  });

  it("DVR exit then re-enter: the new player's timeRange picks up frames recorded during the prior DVR", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const session = result.current.session!;
    const baseT = Date.now();
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });
    const firstLive = result.current.liveTimeRange!.latest;

    await act(async () => {
      await result.current.dvr.enter(firstLive - 1_000);
      await settle(10);
    });
    const firstPlayer = result.current.dvr.player!;

    // While in DVR, more frames come in via record(). After exit, the next
    // enter() must produce a player whose timeRange.latest reflects them.
    const extraBaseT = firstLive + 100;
    for (let i = 0; i < 50; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: 1000 + i }, extraBaseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });

    await act(async () => {
      result.current.dvr.exit();
      // Wait past one polling interval (500ms) so useLiveTimeRange picks up
      // the new store latest. settle(50) wasn't enough — that's why we used
      // to see "liveTimeRange.latest === firstLive" here.
      await settle(700);
    });

    // Live range should now include the recorded-during-DVR frames.
    expect(result.current.liveTimeRange!.latest).toBeGreaterThan(firstLive);

    // Second enter — new player; ReplaySession.enterReplay always builds a
    // fresh ReplayPlayer instance so this MUST be a different object.
    await act(async () => {
      await result.current.dvr.enter(result.current.liveTimeRange!.latest - 500);
      await settle(10);
    });
    const secondPlayer = result.current.dvr.player!;
    expect(secondPlayer).not.toBe(firstPlayer);
    expect(result.current.dvr.frozenLatest).toBeGreaterThan(firstLive);

    result.current.dvr.exit();
  });

  it("DVR seek-during-drag: each player.seek() updates currentT without losing earlier seeks", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const session = result.current.session!;
    const baseT = Date.now();
    for (let i = 0; i < 80; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(50);
    });

    const enterT = (result.current.liveTimeRange?.latest ?? baseT) - 1_000;
    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(10);
    });

    // Capture state BEFORE the drag so we can detect the seek really applied.
    const beforeDrag = result.current.dvr.player!.currentT;

    // Drag inward — 4 onChange events would each call player.seek(t).
    const dragPath = [enterT - 200, enterT - 500, enterT - 800, enterT - 1_200];
    await act(async () => {
      for (const t of dragPath) {
        result.current.dvr.player?.seek(t);
      }
    });

    const finalSeek = dragPath[dragPath.length - 1]!;
    const observed = result.current.dvr.player!.currentT;

    // The last seek MUST have applied — currentT can't have ignored every
    // drag and still be hovering around the original enter point.
    expect(observed).toBeLessThan(beforeDrag);
    // currentT sits at the last seek (give it a generous forward-drift
    // budget since the player is in `playing` state and rate=1).
    expect(observed).toBeGreaterThanOrEqual(finalSeek);
    expect(observed - finalSeek).toBeLessThan(3_000);

    result.current.dvr.exit();
  });

  // ─── Phase 13 — auto-exit to live + no tail gap (e2e via hook chain) ───
  // The exact symptoms the user reported on video, expressed as e2e tests
  // through the same hook chain chart-replay.tsx wires up. Real timers, real
  // ReplaySession, real ReplayPlayer.
  it("Phase 13: player.timeRange.latest === dvr.frozenLatest (matches what UI scrubber froze)", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    for (let i = 0; i < 60; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(600); // wait for useLiveTimeRange to poll
    });

    const live = result.current.liveTimeRange!;
    expect(live.latest).toBeGreaterThan(live.earliest);
    const enterT = live.latest - 1_500;

    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(20);
    });

    expect(result.current.dvr.isDvr).toBe(true);
    const frozen = result.current.dvr.frozenLatest!;
    expect(result.current.dvr.player!.timeRange.latest).toBe(frozen);
    // And the scrubber's effective right edge.
    expect(result.current.dvr.effectiveTimeRange?.latest).toBe(frozen);

    result.current.dvr.exit();
  });

  it("Phase 13: cursor reaching frozenLatest triggers auto-exit-to-live", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    for (let i = 0; i < 120; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(600);
    });

    const live = result.current.liveTimeRange!;
    // Enter only ~200ms inside the frozen edge so onEnd fires quickly under
    // real timers (rate=1 → wall clock matches virtual time).
    const frozen = live.latest;
    const enterT = frozen - 200;

    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(20);
    });

    expect(result.current.dvr.isDvr).toBe(true);
    expect(result.current.dvr.player!.timeRange.latest).toBe(frozen);

    // 1 second of wall clock easily covers the 200ms gap to frozenLatest.
    // onEnd should fire → useReplayDvr's auto-exit handler runs → isDvr=false.
    await act(async () => { await settle(1_000); });
    expect(result.current.dvr.isDvr).toBe(false);
    expect(result.current.dvr.player).toBeNull();
    expect(result.current.dvr.frozenLatest).toBeNull();
  });

  it("Phase 13: enter() internally flushes so tail frames in store._pending are queryable", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    // 100 frames at 20Hz = 5s of data. Manually flush so IDB has them.
    for (let i = 0; i < 100; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(600); // let useLiveTimeRange catch up
    });

    // Record 5 MORE frames that stay in store._pending (no flush). Before
    // Phase 13, the player's _timeRange.latest was set from getTimeRange()
    // BEFORE the pending was flushed, so prefetching couldn't see these.
    for (let i = 100; i < 105; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    const expectedTail = baseT + 104 * 50;
    // Sanity: without flush, IDB doesn't yet contain the tail.
    const idbBefore = await session.getTimeRange();
    expect(idbBefore!.latest).toBeLessThan(expectedTail);

    // The fix: enter() runs inside session.enterReplay which flushes the
    // pending batch BEFORE reading getTimeRange. After enter, the tail
    // frames are queryable from IDB.
    const live = result.current.liveTimeRange!;
    await act(async () => {
      await result.current.dvr.enter(live.latest - 1_000);
      await settle(20);
    });

    const idbAfter = await session.getTimeRange();
    expect(idbAfter!.latest).toBeGreaterThanOrEqual(expectedTail);

    result.current.dvr.exit();
  });

  // ─── Phase 14 — 1-second cursor snap + DVR→Live backfill (e2e) ────────
  it("Phase 14: replayPlayer.currentT advances in 1-second snaps after enter()", async () => {
    const { result } = renderHook(() => useChartReplayDemoFlow());
    await act(async () => { await settle(50); });

    const baseT = Date.now();
    const session = result.current.session!;
    for (let i = 0; i < 200; i++) {
      result.current.record(CHANNEL_ID, { name: CHANNEL_ID, value: i }, baseT + i * 50);
    }
    await act(async () => {
      await session.store.flush();
      await settle(600); // let useLiveTimeRange poll
    });

    const live = result.current.liveTimeRange!;
    const enterT = live.latest - 4_000;

    await act(async () => {
      await result.current.dvr.enter(enterT);
      await settle(20);
    });

    expect(result.current.dvr.isDvr).toBe(true);

    // Capture the snapped cursor right after enter.
    const tEntry = result.current.replayPlayer.currentT;
    expect(tEntry % 1000).toBe(0); // snapped to a second

    // Wait > 1 second of wall time so the snap boundary is crossed at rate=1.
    await act(async () => { await settle(1_200); });
    const tAfter = result.current.replayPlayer.currentT;
    expect(tAfter).toBeGreaterThan(tEntry);
    expect(tAfter % 1000).toBe(0);
    // And the increment is a whole-second multiple.
    expect((tAfter - tEntry) % 1000).toBe(0);

    result.current.dvr.exit();
  });

  // Direct hook-level verification of "DVR ended → backfill triggers". The
  // demo wires `active: isLive` so this fires precisely when the user
  // returns to live mode. We exercise the same shape: mount with active=true,
  // flip to false (DVR), flip back to true, and assert the store + chart
  // ran one round of flush + query + reset + pushBatch on the return trip.
  it("Phase 14: useChartLiveBackfill runs on each DVR→Live transition (e2e shape)", async () => {
    const { MetricChannel: Channel } = await import(
      "../../../entities/metric-channel/metric-channel"
    );
    const { useChartLiveBackfill: hook } = await import(
      "../../chart-replay/lib/use-chart-live-backfill"
    );
    const { makeFakeHost, makeFakeStore, metricFrame } = await import(
      "../../chart-replay/lib/chart-replay-fixtures"
    );

    const channel = new Channel(CHANNEL_ID);
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const store = makeFakeStore({
      [CHANNEL_ID]: [
        metricFrame(CHANNEL_ID, fixedNow - 2_500, 1),
        metricFrame(CHANNEL_ID, fixedNow - 1_500, 2),
      ],
    });

    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) =>
        hook({
          host: host.host as never,
          store: store as never,
          channel,
          layerId: CHANNEL_ID,
          windowMs: 5_000,
          pickValue: (d) => d.value,
          active,
        }),
      { initialProps: { active: true } },
    );

    // Initial active=true → one backfill on mount.
    // Each backfill emits ONE reset (the atomic post-query reset+pushBatch);
    // there is no premature clear, so the chart never renders empty.
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(store.flush).toHaveBeenCalledTimes(1);
    expect(host.resets.length).toBe(1);

    // DVR enter → active=false. No additional backfill.
    await act(async () => {
      rerender({ active: false });
      await Promise.resolve();
    });
    expect(store.flush).toHaveBeenCalledTimes(1);

    // DVR exit → active=true again. One more backfill round = 1 more reset.
    await act(async () => {
      rerender({ active: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(store.flush).toHaveBeenCalledTimes(2);
    expect(host.resets.length).toBe(2);
    expect(host.batches.length).toBe(2);
    expect(host.batches.at(-1)?.samples.length).toBe(2);

    unmount();
    vi.restoreAllMocks();
  });
});
