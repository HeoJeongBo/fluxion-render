import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRecording,
  ChartReplayProbe,
  makeFakeHost,
  makeFakePlayer,
  makeFakeStore,
  metricFrame,
} from "./chart-replay-fixtures";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useChartReplay", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("hydrates from store on mount: reset(currentT) then pushBatch(decoded backfill)", async () => {
    const { host, handle, batches, resets, order } = makeFakeHost();
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({
      signal: [
        metricFrame("signal", 3500, 0.1),
        metricFrame("signal", 4000, 0.5),
        metricFrame("signal", 4800, 0.9),
      ],
    });

    await act(async () => {
      render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
      // Allow the async hydrate Promise chain to resolve.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getFramesByChannel).toHaveBeenCalledWith("signal", 3000, 5000);
    // Reset must fire BEFORE pushBatch so the worker axis rewinds first.
    expect(order[0]).toBe("reset:5000");
    expect(order[1]).toBe("pushBatch:3");

    // Backfill: ascending by t, with the right decoded values.
    expect(batches).toHaveLength(1);
    expect(batches[0].samples.map((s) => s.t)).toEqual([3500, 4000, 4800]);
    expect(batches[0].samples.map((s) => s.y)).toEqual([0.1, 0.5, 0.9]);

    // Sanity: handle was resolved via host.line("signal").
    expect(handle.reset).toHaveBeenCalledTimes(1);
    expect(resets[0]).toEqual({ id: "signal", latestT: 5000 });
  });

  it("re-hydrates on player.onSeek(t)", async () => {
    const { host, batches, resets } = makeFakeHost();
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({
      signal: [
        metricFrame("signal", 3500, 0.1),
        metricFrame("signal", 4000, 0.5),
        metricFrame("signal", 4800, 0.9),
        metricFrame("signal", 8500, 0.2),
        metricFrame("signal", 9000, 0.4),
      ],
    });

    await act(async () => {
      render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Clear baseline counts for clarity in the assertion below.
    const initialBatches = batches.length;
    const initialResets = resets.length;

    // Seek forward to 9000 → fresh hydrate at [7000, 9000].
    await act(async () => {
      player.emitSeek(9000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(store.getFramesByChannel).toHaveBeenLastCalledWith("signal", 7000, 9000);
    expect(resets[initialResets]).toEqual({ id: "signal", latestT: 9000 });
    expect(batches[initialBatches].samples.map((s) => s.t)).toEqual([8500, 9000]);
  });

  it("forwards live frames via handle.push (no reset, no batch)", async () => {
    const { host, pushes, batches, resets } = makeFakeHost();
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({ signal: [] });

    await act(async () => {
      render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const baseResets = resets.length;
    const baseBatches = batches.length;

    const ch = new MetricChannel("signal");
    await act(async () => {
      player.emitFrame({
        channelId: "signal",
        data: ch.decode(ch.encode({ name: "signal", value: 0.7 })),
        t: 5050,
      });
    });

    expect(pushes).toHaveLength(1);
    expect(pushes[0].sample).toEqual({ t: 5050, y: 0.7 });
    // Live path must not touch reset/batch.
    expect(resets.length).toBe(baseResets);
    expect(batches.length).toBe(baseBatches);
  });

  it("ignores frames for other channels", async () => {
    const { host, pushes } = makeFakeHost();
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({ signal: [] });

    await act(async () => {
      render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
      await Promise.resolve();
    });

    await act(async () => {
      player.emitFrame({ channelId: "other", data: { name: "other", value: 99 }, t: 5050 });
    });
    expect(pushes).toHaveLength(0);
  });

  it("is a no-op when player is null", async () => {
    const { host, batches, resets, pushes } = makeFakeHost();
    const store = makeFakeStore({ signal: [metricFrame("signal", 100, 1)] });

    await act(async () => {
      render(<ChartReplayProbe host={host} player={null} store={store} windowMs={1000} />);
      await Promise.resolve();
    });
    expect(store.getFramesByChannel).not.toHaveBeenCalled();
    expect(batches).toHaveLength(0);
    expect(resets).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it("is a no-op when host is null", async () => {
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({ signal: [metricFrame("signal", 100, 1)] });

    await act(async () => {
      render(<ChartReplayProbe host={null} player={player} store={store} windowMs={1000} />);
      await Promise.resolve();
    });
    expect(store.getFramesByChannel).not.toHaveBeenCalled();
    expect(player.frameListenerCount()).toBe(0);
    expect(player.seekListenerCount()).toBe(0);
  });

  it("unsubscribes player listeners on unmount", async () => {
    const { host, pushes, batches, resets } = makeFakeHost();
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({ signal: [] });

    let unmount: () => void = () => {};
    await act(async () => {
      const r = render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
      unmount = r.unmount;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(player.frameListenerCount()).toBe(1);
    expect(player.seekListenerCount()).toBe(1);
    const baseResets = resets.length;
    const basePushes = pushes.length;
    const baseBatches = batches.length;

    await act(async () => { unmount(); });
    expect(player.frameListenerCount()).toBe(0);
    expect(player.seekListenerCount()).toBe(0);

    // Post-unmount emissions are ignored.
    await act(async () => {
      player.emitSeek(2000);
      player.emitFrame({ channelId: "signal", data: { name: "signal", value: 1 }, t: 100 });
      await Promise.resolve();
    });
    expect(resets.length).toBe(baseResets);
    expect(pushes.length).toBe(basePushes);
    expect(batches.length).toBe(baseBatches);
  });

  it("hydrate with empty backfill still resets (so the axis rewinds even with no data)", async () => {
    const { host, batches, resets } = makeFakeHost();
    const player = makeFakePlayer(5000);
    const store = makeFakeStore({ signal: [] }); // nothing in range

    await act(async () => {
      render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(resets).toEqual([{ id: "signal", latestT: 5000 }]);
    expect(batches).toHaveLength(0); // empty batch is skipped
  });

  // ── timeOrigin option ────────────────────────────────────────────────────

  describe("timeOrigin option", () => {
    it("subtracts timeOrigin from every backfill sample.t and from the reset latestT", async () => {
      const { host, batches, resets } = makeFakeHost();
      const ORIGIN = 1_000_000;
      const player = makeFakePlayer(ORIGIN + 5000); // 5s into the session
      const store = makeFakeStore({
        signal: [
          metricFrame("signal", ORIGIN + 3500, 0.1),
          metricFrame("signal", ORIGIN + 4000, 0.5),
          metricFrame("signal", ORIGIN + 4800, 0.9),
        ],
      });

      await act(async () => {
        render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={2000}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      // Store query stays in absolute t.
      expect(store.getFramesByChannel).toHaveBeenCalledWith(
        "signal",
        ORIGIN + 3000,
        ORIGIN + 5000,
      );
      // reset/push are host-relative (origin-subtracted).
      expect(resets[0]).toEqual({ id: "signal", latestT: 5000 });
      expect(batches[0].samples.map((s) => s.t)).toEqual([3500, 4000, 4800]);
      expect(batches[0].samples.map((s) => s.y)).toEqual([0.1, 0.5, 0.9]);
    });

    it("subtracts timeOrigin from live onFrame pushes", async () => {
      const { host, pushes } = makeFakeHost();
      const ORIGIN = 1_000_000;
      const player = makeFakePlayer(ORIGIN + 5000);
      const store = makeFakeStore({ signal: [] });

      await act(async () => {
        render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={2000}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
      });

      const ch = new MetricChannel("signal");
      await act(async () => {
        player.emitFrame({
          channelId: "signal",
          data: ch.decode(ch.encode({ name: "signal", value: 0.7 })),
          t: ORIGIN + 5050,
        });
      });

      expect(pushes).toHaveLength(1);
      expect(pushes[0].sample).toEqual({ t: 5050, y: 0.7 });
    });

    it("default (omitted) timeOrigin behaves like 0 — no regression", async () => {
      const { host, batches, resets } = makeFakeHost();
      const player = makeFakePlayer(5000);
      const store = makeFakeStore({
        signal: [metricFrame("signal", 4000, 0.5)],
      });

      await act(async () => {
        render(<ChartReplayProbe host={host} player={player} store={store} windowMs={2000} />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(resets[0]).toEqual({ id: "signal", latestT: 5000 });
      expect(batches[0].samples).toEqual([{ t: 4000, y: 0.5 }]);
    });
  });

  // ── Scenario: 60s recording, seek back to 30s ────────────────────────────
  // Reproduces the real-world flow that motivated the timeOrigin option: the
  // user records for 60s straight at 20Hz, then time-travels to t=30s and
  // expects the chart to refill with the prior 5s of samples.

  describe("scenario: 60s recording, seek back to 30s", () => {
    const ORIGIN = 1_000_000;
    const SESSION_MS = 60_000;
    const HZ = 20;
    const WINDOW_MS = 5_000;

    /** Build 1200 metric frames at 20Hz spanning [ORIGIN, ORIGIN + 60_000]. */
    const recording = () => ({
      signal: buildRecording({ origin: ORIGIN, hz: HZ, durationMs: SESSION_MS }),
    });

    it("backfills the chart with the prior 5s of samples on mount at t=30s", async () => {
      const { host, batches, resets } = makeFakeHost();
      const seekT = ORIGIN + 30_000;
      const player = makeFakePlayer(seekT);
      const store = makeFakeStore(recording());

      await act(async () => {
        render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={WINDOW_MS}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      // 1) Store queried with absolute t bounds [seekT - 5s, seekT].
      expect(store.getFramesByChannel).toHaveBeenCalledWith(
        "signal",
        seekT - WINDOW_MS,
        seekT,
      );

      // 2) Layer rewound to the host-relative seek point.
      expect(resets).toEqual([{ id: "signal", latestT: 30_000 }]);

      // 3) ~100 samples in the backfill batch (5s × 20Hz).
      expect(batches).toHaveLength(1);
      const samples = batches[0].samples;
      // IDBKeyRange.bound is inclusive on both ends, so [25_000, 30_000] yields
      // the 25_000ms sample plus 99 samples at 50ms intervals = 101 total.
      // The exact count is less important than the host-relative range.
      expect(samples.length).toBeGreaterThanOrEqual(100);
      expect(samples.length).toBeLessThanOrEqual(101);

      // 4) Every sample.t is host-relative — inside [25_000, 30_000]. None
      //    land on the absolute scale that would have collapsed to a single
      //    Float32 bucket.
      const ts = samples.map((s) => s.t);
      expect(Math.min(...ts)).toBeGreaterThanOrEqual(25_000);
      expect(Math.max(...ts)).toBeLessThanOrEqual(30_000);

      // 5) Sorted ascending — same order the store returned them.
      for (let i = 1; i < ts.length; i++) {
        expect(ts[i]).toBeGreaterThan(ts[i - 1]!);
      }

      // 6) Distinct timestamps — the bug fix's core guarantee. If timeOrigin
      //    weren't applied, all 100 samples would have collapsed onto the
      //    same Float32-quantised t.
      const distinct = new Set(ts);
      expect(distinct.size).toBe(ts.length);
    });

    it("re-hydrates on seek back another 10s — new window [15s, 20s]", async () => {
      const { host, batches, resets } = makeFakeHost();
      const initialT = ORIGIN + 30_000;
      const player = makeFakePlayer(initialT);
      const store = makeFakeStore(recording());

      await act(async () => {
        render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={WINDOW_MS}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      const baseBatches = batches.length;
      const baseResets = resets.length;

      // Scrub back another 10s — common DVR interaction.
      const newT = ORIGIN + 20_000;
      await act(async () => {
        player.emitSeek(newT);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Fresh query at the new bounds.
      expect(store.getFramesByChannel).toHaveBeenLastCalledWith(
        "signal",
        newT - WINDOW_MS,
        newT,
      );
      expect(resets[baseResets]).toEqual({ id: "signal", latestT: 20_000 });

      const samples = batches[baseBatches].samples;
      const ts = samples.map((s) => s.t);
      expect(Math.min(...ts)).toBeGreaterThanOrEqual(15_000);
      expect(Math.max(...ts)).toBeLessThanOrEqual(20_000);
      expect(new Set(ts).size).toBe(ts.length);
    });

    it("seek near the start clamps to the available recording window", async () => {
      const { host, batches, resets } = makeFakeHost();
      const player = makeFakePlayer(ORIGIN + 30_000);
      const store = makeFakeStore(recording());

      await act(async () => {
        render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={WINDOW_MS}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      const baseBatches = batches.length;
      const baseResets = resets.length;

      // Seek 2s in — only the first 2s of samples are available.
      // The window [-3_000, 2_000] should still produce a non-degenerate batch.
      const seekT = ORIGIN + 2_000;
      await act(async () => {
        player.emitSeek(seekT);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Store is queried with the underflow bound — IDB returns what exists.
      expect(store.getFramesByChannel).toHaveBeenLastCalledWith(
        "signal",
        seekT - WINDOW_MS,
        seekT,
      );
      expect(resets[baseResets]).toEqual({ id: "signal", latestT: 2_000 });

      const samples = batches[baseBatches].samples;
      // 0..2_000ms at 20Hz = up to 41 samples.
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.length).toBeLessThanOrEqual(41);
      for (const s of samples) {
        expect(s.t).toBeGreaterThanOrEqual(0);
        expect(s.t).toBeLessThanOrEqual(2_000);
      }
    });

    it("live playback after seek: incoming onFrame pushes use host-relative t", async () => {
      const { host, pushes } = makeFakeHost();
      const player = makeFakePlayer(ORIGIN + 30_000);
      const store = makeFakeStore(recording());

      await act(async () => {
        render(
          <ChartReplayProbe
            host={host}
            player={player}
            store={store}
            windowMs={WINDOW_MS}
            timeOrigin={ORIGIN}
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      // Simulate the player ticking forward: emit a frame at t=30_050ms.
      const ch = new MetricChannel("signal");
      await act(async () => {
        player.emitFrame({
          channelId: "signal",
          data: ch.decode(ch.encode({ name: "signal", value: 0.123 })),
          t: ORIGIN + 30_050,
        });
      });

      expect(pushes).toHaveLength(1);
      expect(pushes[0].sample).toEqual({ t: 30_050, y: 0.123 });
    });
  });
});
