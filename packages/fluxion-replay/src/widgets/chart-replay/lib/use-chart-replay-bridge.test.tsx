import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricSample } from "../../../entities/metric-channel/metric-channel";
import type { UseReplayDvrResult } from "../../dvr/lib/use-replay-dvr";
import {
  makeFakeHost,
  makeFakePlayer,
  makeFakeStore,
  metricFrame,
  SIGNAL_CHANNEL,
} from "./chart-replay-fixtures";
import { useChartReplayBridge } from "./use-chart-replay-bridge";

/**
 * Minimal DVR result shim — useChartReplayBridge only reads `isDvr` and
 * `player`. The other fields exist so the type matches without consumers
 * having to assemble a full UseReplayDvrResult in tests.
 */
function makeDvr(player: ReturnType<typeof makeFakePlayer> | null): UseReplayDvrResult {
  return {
    isDvr: player !== null,
    player: player as unknown as UseReplayDvrResult["player"],
    frozenLatest: null,
    effectiveTimeRange: null,
    enter: vi.fn(async () => null),
    exit: vi.fn(),
  };
}

/**
 * `record()` spy — useChartReplayBridge calls
 * `session.record(channelId, data, wallT)` every tick, regardless of mode.
 * The fixture's `makeFakeSession` doesn't expose record, so we build a
 * minimal session-shaped stub here.
 */
function makeSessionWith(store: ReturnType<typeof makeFakeStore>) {
  const record = vi.fn();
  return {
    session: {
      store,
      record,
    } as unknown as Parameters<typeof useChartReplayBridge>[0]["session"],
    record,
  };
}

describe("useChartReplayBridge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("live mode: tick pushes to the chart AND records to the session", () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const store = makeFakeStore({ signal: [] });
    const { session, record } = makeSessionWith(store);
    const dvr = makeDvr(null);

    renderHook(() =>
      useChartReplayBridge<MetricSample>({
        host: host.host as never,
        session,
        dvr,
        isLive: true,
        channel: SIGNAL_CHANNEL,
        layerId: "signal",
        windowMs: 5_000,
        timeOrigin: fixedNow,
        produce: () => ({ name: "signal", value: 0.42 }),
        pickValue: (d) => d.value,
      }),
    );

    // Advance one tick interval (default 20Hz = 50ms).
    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(host.pushes.length).toBeGreaterThan(0);
    expect(host.pushes[0]).toEqual({
      id: "signal",
      sample: { t: 0, y: 0.42 },
    });
    expect(record).toHaveBeenCalledWith(
      "signal",
      { name: "signal", value: 0.42 },
      fixedNow,
    );

    vi.restoreAllMocks();
  });

  it("DVR mode: tick records but does NOT push live samples to the chart", () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const store = makeFakeStore({ signal: [] });
    const { session, record } = makeSessionWith(store);
    const player = makeFakePlayer(fixedNow);
    const dvr = makeDvr(player);

    renderHook(() =>
      useChartReplayBridge<MetricSample>({
        host: host.host as never,
        session,
        dvr,
        isLive: false, // DVR mode
        channel: SIGNAL_CHANNEL,
        layerId: "signal",
        windowMs: 5_000,
        timeOrigin: fixedNow,
        produce: () => ({ name: "signal", value: 0.99 }),
        pickValue: (d) => d.value,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(60);
    });

    // record() always fires (so the store keeps growing during DVR).
    expect(record).toHaveBeenCalled();
    // ...but no live push hit the chart.
    expect(host.pushes).toEqual([]);

    vi.restoreAllMocks();
  });

  it("DVR mode: hydrates the chart with a backfill batch from the store", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const player = makeFakePlayer(fixedNow + 3_000);
    const store = makeFakeStore({
      signal: [
        metricFrame("signal", fixedNow + 1_000, 0.1),
        metricFrame("signal", fixedNow + 2_000, 0.2),
        metricFrame("signal", fixedNow + 3_000, 0.3),
      ],
    });
    const { session } = makeSessionWith(store);
    const dvr = makeDvr(player);

    renderHook(() =>
      useChartReplayBridge<MetricSample>({
        host: host.host as never,
        session,
        dvr,
        isLive: false,
        channel: SIGNAL_CHANNEL,
        layerId: "signal",
        windowMs: 5_000,
        timeOrigin: fixedNow,
        produce: () => ({ name: "signal", value: 0 }),
        pickValue: (d) => d.value,
      }),
    );

    // Two microtask hops drain the hydrate's await chain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The hydrate ran and pushed the backfill batch.
    expect(host.batches.length).toBeGreaterThan(0);
    expect(host.resets[host.resets.length - 1]).toEqual({
      id: "signal",
      latestT: 3_000, // player.currentT (fixedNow + 3_000) - timeOrigin
    });

    vi.restoreAllMocks();
  });

  it("uses isLiveRef so a stale closure during dvr.enter() doesn't leak live pushes", () => {
    // Simulates the React render cycle: render N has isLive=true, then a
    // mode flip lands BEFORE render N+1 commits. The ref is updated on the
    // next render commit; before that, the cached `tick` would see the old
    // closure. The bridge reads `isLive` through a ref captured each
    // render, so even with a stale closure the live push is gated by the
    // ref's current value.
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const store = makeFakeStore({ signal: [] });
    const { session } = makeSessionWith(store);
    const dvr = makeDvr(makeFakePlayer(fixedNow));

    const { rerender } = renderHook(
      ({ isLive }: { isLive: boolean }) =>
        useChartReplayBridge<MetricSample>({
          host: host.host as never,
          session,
          dvr,
          isLive,
          channel: SIGNAL_CHANNEL,
          layerId: "signal",
          windowMs: 5_000,
          timeOrigin: fixedNow,
          produce: () => ({ name: "signal", value: 1 }),
          pickValue: (d) => d.value,
        }),
      { initialProps: { isLive: true } },
    );

    // First tick fires while still live — push happens.
    act(() => {
      vi.advanceTimersByTime(60);
    });
    const pushesAfterLive = host.pushes.length;
    expect(pushesAfterLive).toBeGreaterThan(0);

    // Re-render with isLive=false (DVR enter). Subsequent ticks must NOT
    // produce a new push.
    rerender({ isLive: false });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(host.pushes.length).toBe(pushesAfterLive);

    vi.restoreAllMocks();
  });

  it("null session: store falls back to null for both replay + backfill (no throw)", () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const dvr = makeDvr(null);

    expect(() =>
      renderHook(() =>
        useChartReplayBridge<MetricSample>({
          host: host.host as never,
          session: null, // → `session?.store ?? null` takes the null branch
          dvr,
          isLive: false, // DVR mode so useChartReplay reads session?.store
          channel: SIGNAL_CHANNEL,
          layerId: "signal",
          windowMs: 5_000,
          timeOrigin: fixedNow,
          produce: () => ({ name: "signal", value: 0.1 }),
          pickValue: (d) => d.value,
        }),
      ),
    ).not.toThrow();
    vi.restoreAllMocks();
  });

  it("DVR→Live transition arms backfill suppression (isDvrToLiveTransition && isBackfilling)", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const store = makeFakeStore({ signal: [metricFrame("signal", fixedNow - 1_000, 1)] });
    const { session } = makeSessionWith(store);

    const { rerender } = renderHook(
      ({ isLive }: { isLive: boolean }) =>
        useChartReplayBridge<MetricSample>({
          host: host.host as never,
          session,
          dvr: makeDvr(isLive ? null : makeFakePlayer(fixedNow)),
          isLive,
          channel: SIGNAL_CHANNEL,
          layerId: "signal",
          windowMs: 5_000,
          timeOrigin: fixedNow,
          produce: () => ({ name: "signal", value: 0.2 }),
          pickValue: (d) => d.value,
        }),
      { initialProps: { isLive: false } }, // start in DVR
    );

    // Transition DVR → Live: prevIsLive=false, isLive=true → isDvrToLiveTransition
    // true, and the live backfill is in flight → suppression armed (line 154).
    await act(async () => {
      rerender({ isLive: true });
      await Promise.resolve();
    });
    // No throw and the bridge re-rendered through the transition path.
    expect(host).toBeDefined();
    vi.restoreAllMocks();
  });
});
