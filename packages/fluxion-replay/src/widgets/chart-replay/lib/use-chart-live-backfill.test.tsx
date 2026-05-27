import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricSample } from "../../../entities/metric-channel/metric-channel";
import {
  makeFakeHost,
  makeFakeStore,
  metricFrame,
  SIGNAL_CHANNEL,
} from "./chart-replay-fixtures";
import { useChartLiveBackfill } from "./use-chart-live-backfill";

function setup(active: boolean, frames = [metricFrame("signal", 100, 1)], timeOrigin = 0) {
  const host = makeFakeHost();
  const store = makeFakeStore({ signal: frames });
  const { rerender, unmount } = renderHook(
    ({ active: a, h, s }: {
      active: boolean;
      h: typeof host.host | null;
      s: typeof store | null;
    }) =>
      useChartLiveBackfill<MetricSample>({
        // Cast to never — the fakes are structural matches, not nominal.
        // Same pattern as ChartReplayProbe in chart-replay-fixtures.
        host: h as never,
        store: s as never,
        channel: SIGNAL_CHANNEL,
        layerId: "signal",
        windowMs: 5_000,
        timeOrigin,
        pickValue: (d) => d.value,
        active: a,
      }),
    { initialProps: { active, h: host.host, s: store } },
  );
  return { host, store, rerender, unmount };
}

describe("useChartLiveBackfill", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("active=false: no flush, no query, no chart writes", async () => {
    const { store, host } = setup(false);
    // Microtask hop just in case some async slipped through.
    await act(async () => { await Promise.resolve(); });
    expect(store.flush).not.toHaveBeenCalled();
    expect(store.getFramesByChannel).not.toHaveBeenCalled();
    expect(host.resets).toEqual([]);
    expect(host.batches).toEqual([]);
  });

  it("active=true on mount: flush → query → reset → pushBatch in that order", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const frames = [
      metricFrame("signal", fixedNow - 3_000, 11),
      metricFrame("signal", fixedNow - 1_000, 22),
    ];
    const { store, host } = setup(true, frames);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(store.flush).toHaveBeenCalledTimes(1);
    expect(store.getFramesByChannel).toHaveBeenCalledWith(
      "signal",
      fixedNow - 5_000,
      fixedNow,
    );
    // The flush completes before the query — observe via call order.
    const flushOrder = store.flush.mock.invocationCallOrder[0]!;
    const queryOrder = store.getFramesByChannel.mock.invocationCallOrder[0]!;
    expect(flushOrder).toBeLessThan(queryOrder);

    // Phase 16: the sync immediate reset fires FIRST (race-safety), then
    // the async chain produces another reset at the same timestamp.
    expect(host.resets).toEqual([
      { id: "signal", latestT: fixedNow },
      { id: "signal", latestT: fixedNow },
    ]);
    expect(host.batches).toEqual([
      {
        id: "signal",
        samples: [
          { t: fixedNow - 3_000, y: 11 },
          { t: fixedNow - 1_000, y: 22 },
        ],
      },
    ]);

    vi.restoreAllMocks();
  });

  it("active false → true transition re-runs the backfill", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const { host, store, rerender } = setup(false, [
      metricFrame("signal", fixedNow - 2_000, 9),
    ]);
    await act(async () => { await Promise.resolve(); });
    expect(store.flush).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ active: true, h: host.host, s: store });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.flush).toHaveBeenCalledTimes(1);
    // Phase 16: 2 resets — sync immediate + async post-query.
    expect(host.resets.length).toBe(2);
    expect(host.batches.length).toBe(1);

    vi.restoreAllMocks();
  });

  it("active true → false: cleanup only — no reset, no extra writes", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const { host, store, rerender } = setup(true, [
      metricFrame("signal", fixedNow - 1_000, 5),
    ]);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const flushBefore = store.flush.mock.calls.length;
    const resetsBefore = host.resets.length;
    const batchesBefore = host.batches.length;

    await act(async () => {
      rerender({ active: false, h: host.host, s: store });
      await Promise.resolve();
    });

    // Transitioning into the OFF state must not trigger another query/write.
    expect(store.flush.mock.calls.length).toBe(flushBefore);
    expect(host.resets.length).toBe(resetsBefore);
    expect(host.batches.length).toBe(batchesBefore);

    vi.restoreAllMocks();
  });

  it("timeOrigin shifts both reset latestT and batch sample timestamps", async () => {
    const timeOrigin = 1_700_000_000_000;
    const fixedNow = timeOrigin + 60_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const frames = [
      metricFrame("signal", fixedNow - 2_000, 1),
      metricFrame("signal", fixedNow - 500, 2),
    ];
    const { host } = setup(true, frames, timeOrigin);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(host.resets[0]).toEqual({ id: "signal", latestT: fixedNow - timeOrigin });
    expect(host.batches[0]?.samples).toEqual([
      { t: fixedNow - 2_000 - timeOrigin, y: 1 },
      { t: fixedNow - 500 - timeOrigin, y: 2 },
    ]);
    vi.restoreAllMocks();
  });

  it("no frames in window: still calls reset, skips pushBatch", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    // Frame outside the [now - 5000, now] window.
    const frames = [metricFrame("signal", fixedNow - 60_000, 99)];
    const { host } = setup(true, frames);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    // Phase 16: 2 resets (sync immediate + async re-reset), 0 batches.
    expect(host.resets).toEqual([
      { id: "signal", latestT: fixedNow },
      { id: "signal", latestT: fixedNow },
    ]);
    expect(host.batches).toEqual([]); // nothing to push

    vi.restoreAllMocks();
  });

  it("unmount during in-flight query: no async chart writes after cancellation", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const frames = [metricFrame("signal", fixedNow - 1_000, 7)];
    const { store, host, unmount } = setup(true, frames);
    // Hold the query so the pending promise can't resolve before unmount.
    store.hold();
    await act(async () => { await Promise.resolve(); });
    // Phase 16: sync immediate reset already fired on mount. The async
    // chain is what we want to confirm bails on cancellation.
    expect(host.resets.length).toBe(1);
    // Unmount BEFORE releasing.
    unmount();
    await act(async () => { await store.release(); });
    // Should NOT have touched the layer beyond that initial sync reset.
    expect(host.resets.length).toBe(1);
    expect(host.batches).toEqual([]);
    vi.restoreAllMocks();
  });

  it("layerId defaults to channel.channelId when not provided (branch line 65)", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const host = makeFakeHost();
    const frames = [metricFrame("signal", fixedNow - 1_000, 3)];
    const store = makeFakeStore({ signal: frames });

    renderHook(() =>
      useChartLiveBackfill<MetricSample>({
        host: host.host as never,
        store: store as never,
        channel: SIGNAL_CHANNEL,
        // layerId intentionally omitted → falls back to channel.channelId ("signal")
        windowMs: 5_000,
        timeOrigin: 0,
        pickValue: (d) => d.value,
        active: true,
      }),
    );
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // host.line should have been called with "signal" (channel.channelId)
    expect(host.host.line).toHaveBeenCalledWith("signal");
    vi.restoreAllMocks();
  });

  it("host=null: handle is null, effect returns early (branch line 74)", async () => {
    const store = makeFakeStore({ signal: [] });
    // No throws and no interactions with store — effect exits early
    expect(() =>
      renderHook(() =>
        useChartLiveBackfill<MetricSample>({
          host: null,
          store: store as never,
          channel: SIGNAL_CHANNEL,
          layerId: "signal",
          windowMs: 5_000,
          timeOrigin: 0,
          pickValue: (d) => d.value,
          active: true,
        }),
      )
    ).not.toThrow();
    await act(async () => { await Promise.resolve(); });
    expect(store.flush).not.toHaveBeenCalled();
  });

  // Phase 16: the sync immediate reset is the smoking-gun for the
  // DVR→Live exit-race. It must fire SYNCHRONOUSLY when active flips true,
  // BEFORE the async query result is processed.
  it("Phase 16: sync immediate reset fires BEFORE the async chain produces its post-query reset", async () => {
    const fixedNow = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const { host, store } = setup(true, [metricFrame("signal", fixedNow - 100, 1)]);
    // Hold the query so the async chain can't progress past its IDB await.
    store.hold();
    // Allow microtasks to run (the `await store.flush()` resolves).
    await act(async () => { await Promise.resolve(); });
    // At this point the query is in flight (held). The sync reset must
    // already be visible WITHOUT any batches being written yet.
    expect(host.resets.length).toBe(1);
    expect(host.resets[0]).toEqual({ id: "signal", latestT: fixedNow });
    expect(host.batches.length).toBe(0);
    // Release the query — the async chain finishes, producing the second
    // reset + batch.
    await act(async () => { await store.release(); await Promise.resolve(); });
    expect(host.resets.length).toBe(2);
    expect(host.batches.length).toBe(1);
    vi.restoreAllMocks();
  });
});
