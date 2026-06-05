/**
 * useChartLiveBackfill — long-recording (~5 min) "return to live" tests.
 *
 * After the user has time-travelled through a 5-minute recording and then jumps
 * back to the LIVE edge, useChartLiveBackfill re-fills the chart with the most
 * recent window [now - windowMs, now] so "now" shows correct, current data.
 * These tests pin Date.now() and seed 5 minutes ending at `now`, then assert the
 * backfill draws exactly the latest window (full sample sequence, reset-first,
 * host-relative t, no leftovers from the DVR window).
 */
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

const HZ = 20;
const STEP_MS = 1000 / HZ; // 50 ms
const DURATION_MS = 300_000; // 5 minutes
const WINDOW_MS = 5_000;
const FRAMES_PER_WINDOW = WINDOW_MS / STEP_MS; // 100

// Fixed wall clock; the recording ends exactly at NOW (live edge).
const NOW = 1_700_000_000_000;
// 6000 frames spanning [NOW - 300_000, NOW]; value === frame index, and since
// the last frame is at NOW, value === (t - (NOW - DURATION_MS + STEP_MS)) / STEP_MS.
// Simpler: make value a direct function of t so assertions are clean.
const RECORDING = Array.from({ length: DURATION_MS / STEP_MS }, (_, i) => {
  const t = NOW - DURATION_MS + STEP_MS + i * STEP_MS; // last (i=5999) → NOW
  return metricFrame("signal", t, t); // value === absolute t (deterministic)
});

/** Exact host-relative samples for the latest window [NOW - WINDOW_MS, NOW]. */
function expectedLatestWindow(timeOrigin = 0) {
  const out: { t: number; y: number }[] = [];
  for (let t = NOW - WINDOW_MS; t <= NOW; t += STEP_MS) {
    out.push({ t: t - timeOrigin, y: t }); // y === absolute t (see RECORDING)
  }
  return out;
}

function setup(active: boolean, timeOrigin = 0) {
  const host = makeFakeHost();
  const store = makeFakeStore({ signal: RECORDING });
  const { rerender, unmount } = renderHook(
    ({
      active: a,
      h,
      s,
    }: {
      active: boolean;
      h: typeof host.host | null;
      s: typeof store | null;
    }) =>
      useChartLiveBackfill<MetricSample>({
        host: h as never,
        store: s as never,
        channel: SIGNAL_CHANNEL,
        layerId: "signal",
        windowMs: WINDOW_MS,
        timeOrigin,
        pickValue: (d) => d.value,
        active: a,
      }),
    { initialProps: { active, h: host.host, s: store } },
  );
  return { host, store, rerender, unmount };
}

describe("useChartLiveBackfill — return to live after 5 min", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => vi.restoreAllMocks());

  it("backfills exactly the latest window [now - windowMs, now] on return to live", async () => {
    const { host, store } = setup(true);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Queries the CURRENT window, not the old DVR position.
    expect(store.getFramesByChannel).toHaveBeenCalledWith("signal", NOW - WINDOW_MS, NOW);

    // A single ring-only reset (no latestT rewind — avoids blanking sibling
    // layers on a shared host) immediately followed by the full latest window.
    // The window advances to `now` via the pushed data, not the reset.
    expect(host.order).toEqual([
      "reset:undef",
      `pushBatch:${FRAMES_PER_WINDOW + 1}`, // 101
    ]);

    expect(host.batches).toHaveLength(1);
    expect(host.batches[0].samples).toEqual(expectedLatestWindow());
    // The chart's right edge is "now".
    expect(host.batches[0].samples.at(-1)!.t).toBe(NOW);
  });

  it("replaces a stale DVR window with the current window (no leftovers)", async () => {
    const host = makeFakeHost();
    const store = makeFakeStore({ signal: RECORDING });

    // Simulate the chart currently showing an OLD DVR window (deep in the past).
    const dvrHandle = host.host.line("signal");
    dvrHandle.reset(NOW - 250_000);
    dvrHandle.pushBatch([{ t: NOW - 250_000, y: NOW - 250_000 }]);
    expect(host.batches).toHaveLength(1);

    // Now return to live: backfill active.
    renderHook(() =>
      useChartLiveBackfill<MetricSample>({
        host: host.host as never,
        store: store as never,
        channel: SIGNAL_CHANNEL,
        layerId: "signal",
        windowMs: WINDOW_MS,
        timeOrigin: 0,
        pickValue: (d) => d.value,
        active: true,
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // A fresh reset to `now` (not the stale 250k) then the current window. The
    // new batch is the latest window — none of its samples are near the old one.
    const latestBatch = host.batches.at(-1)!;
    expect(latestBatch.samples).toEqual(expectedLatestWindow());
    for (const s of latestBatch.samples) {
      expect(s.t).toBeGreaterThanOrEqual(NOW - WINDOW_MS); // nothing from 250k ago
    }
    // The backfill's reset is ring-only (no latestT); the current window is
    // established by the pushed batch, replacing the stale DVR samples.
    expect(host.resets.at(-1)).toEqual({ id: "signal", latestT: undefined });
  });

  it("shifts the backfilled window host-relative by timeOrigin", async () => {
    const TIME_ORIGIN = NOW - 60_000; // origin near the live edge
    const { host } = setup(true, TIME_ORIGIN);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.batches).toHaveLength(1);
    expect(host.batches[0].samples).toEqual(expectedLatestWindow(TIME_ORIGIN));
    expect(host.batches[0].samples.at(-1)!.t).toBe(NOW - TIME_ORIGIN); // host-relative now
    // Ring-only clear — the host-relative shift lives in the pushed batch, not the reset.
    expect(host.resets.at(-1)).toEqual({ id: "signal", latestT: undefined });
  });
});
