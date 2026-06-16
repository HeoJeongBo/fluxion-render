import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../../features/host";
import { type MultiSeries, useMultiSeriesChart } from "./use-multi-series-chart";

function makeStubHost() {
  const pushes: { id: string; t: number; y: number }[] = [];
  const host = {
    line: (id: string) => ({
      push: (s: { t: number; y: number }) => pushes.push({ id, ...s }),
    }),
  } as unknown as FluxionHost;
  return { host, pushes };
}

const TWO: MultiSeries[] = [
  { id: "a", color: "#4fc3f7", sample: (t) => t },
  { id: "b", color: "#ffb060", sample: () => ({ t: 9, y: 5 }) },
];

describe("useMultiSeriesChart", () => {
  it("builds 1 axis + N line layers with ids and colours mapped", () => {
    const { result } = renderHook(() =>
      useMultiSeriesChart({ series: TWO, hz: 60, windowMs: 5000, timeOrigin: 0 }),
    );
    const [axis, l1, l2] = result.current.layers;
    expect(result.current.layers).toHaveLength(3);
    expect(axis?.kind).toBe("axis-grid");
    expect(l1?.id).toBe("a");
    expect((l1?.config as { color: string }).color).toBe("#4fc3f7");
    expect(l2?.id).toBe("b");
    expect((l2?.config as { color: string }).color).toBe("#ffb060");
  });

  it("changes the layers identity when the series count changes (remount signal)", () => {
    const { result, rerender } = renderHook(
      (p: { series: MultiSeries[] }) =>
        useMultiSeriesChart({ series: p.series, hz: 60, windowMs: 1000, timeOrigin: 0 }),
      { initialProps: { series: TWO } },
    );
    const first = result.current.layers;
    rerender({ series: TWO });
    expect(result.current.layers).toBe(first); // stable when unchanged
    rerender({ series: [TWO[0]!] });
    expect(result.current.layers).not.toBe(first);
    expect(result.current.layers).toHaveLength(2);
  });

  describe("stream fan-out", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("pushes every series each tick and writes to the cache", () => {
      const { host, pushes } = makeStubHost();
      const cachePush = vi.fn();
      const cache = { push: cachePush } as never;
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: TWO,
          hz: 100,
          windowMs: 1000,
          timeOrigin: 0,
          cache,
        }),
      );
      act(() => result.current.setHost(host));
      act(() => vi.advanceTimersByTime(15));
      expect(pushes.some((p) => p.id === "a")).toBe(true);
      expect(pushes.some((p) => p.id === "b" && p.t === 9 && p.y === 5)).toBe(true);
      expect(cachePush).toHaveBeenCalledWith("b", 9, 5);
    });

    it("pushes without a cache (cache is optional)", () => {
      const { host, pushes } = makeStubHost();
      const { result } = renderHook(() =>
        useMultiSeriesChart({ series: TWO, hz: 100, windowMs: 1000, timeOrigin: 0 }),
      );
      act(() => result.current.setHost(host));
      act(() => vi.advanceTimersByTime(15));
      expect(pushes.length).toBeGreaterThan(0);
    });
  });

  it("defaults timeOrigin to a stable useTimeOrigin() when omitted", () => {
    const { result, rerender } = renderHook(
      (p: { hz: number }) =>
        useMultiSeriesChart({ series: TWO, hz: p.hz, windowMs: 1000 }),
      { initialProps: { hz: 60 } },
    );
    const origin1 = (result.current.layers[0]?.config as { timeOrigin: number })
      .timeOrigin;
    expect(typeof origin1).toBe("number");
    rerender({ hz: 60 });
    const origin2 = (result.current.layers[0]?.config as { timeOrigin: number })
      .timeOrigin;
    expect(origin2).toBe(origin1);
  });

  describe("distinguishBy: dash palette", () => {
    const dashOf = (layer: { config?: unknown } | undefined) =>
      (layer?.config as { dashArray?: number[] }).dashArray;

    it("cycles a distinct dash pattern across series when distinguishBy='dash'", () => {
      const three: MultiSeries[] = [
        { id: "a", color: "#1", sample: () => 0 },
        { id: "b", color: "#2", sample: () => 0 },
        { id: "c", color: "#3", sample: () => 0 },
      ];
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: three,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          distinguishBy: "dash",
        }),
      );
      const [, a, b, c] = result.current.layers;
      expect(dashOf(a)).toEqual([]); // index 0 → solid
      expect(dashOf(b)).toEqual([6, 4]); // index 1
      expect(dashOf(c)).toEqual([2, 3]); // index 2
    });

    it("leaves dashArray undefined when distinguishBy is omitted", () => {
      const { result } = renderHook(() =>
        useMultiSeriesChart({ series: TWO, hz: 60, windowMs: 1000, timeOrigin: 0 }),
      );
      expect(dashOf(result.current.layers[1])).toBeUndefined();
    });

    it("an explicit per-series dashArray overrides the palette", () => {
      const series: MultiSeries[] = [
        { id: "a", color: "#1", sample: () => 0, dashArray: [1, 1] },
        { id: "b", color: "#2", sample: () => 0 },
      ];
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          distinguishBy: "dash",
        }),
      );
      // a keeps its explicit dash; b takes the palette's index-1 pattern.
      expect(dashOf(result.current.layers[1])).toEqual([1, 1]);
      expect(dashOf(result.current.layers[2])).toEqual([6, 4]);
    });
  });

  describe("distinguishBy: offset spread", () => {
    const offsetOf = (layer: { config?: unknown } | undefined) =>
      (layer?.config as { yOffset?: number }).yOffset;
    const three: MultiSeries[] = [
      { id: "a", color: "#1", sample: () => 0 },
      { id: "b", color: "#2", sample: () => 0 },
      { id: "c", color: "#3", sample: () => 0 },
    ];

    it("spreads series by i * offsetStep when distinguishBy='offset'", () => {
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: three,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          distinguishBy: "offset",
          offsetStep: 2,
        }),
      );
      const [, a, b, c] = result.current.layers;
      expect(offsetOf(a)).toBe(0);
      expect(offsetOf(b)).toBe(2);
      expect(offsetOf(c)).toBe(4);
    });

    it("warns once and applies no offset when offsetStep is missing", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: three,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          distinguishBy: "offset", // no offsetStep
        }),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("offsetStep");
      expect(offsetOf(result.current.layers[2])).toBeUndefined();
      warn.mockRestore();
    });

    it("an explicit per-series yOffset overrides the auto spread", () => {
      const series: MultiSeries[] = [
        { id: "a", color: "#1", sample: () => 0, yOffset: 99 },
        { id: "b", color: "#2", sample: () => 0 },
      ];
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          distinguishBy: "offset",
          offsetStep: 5,
        }),
      );
      expect(offsetOf(result.current.layers[1])).toBe(99); // explicit
      expect(offsetOf(result.current.layers[2])).toBe(5); // i=1 * 5
    });

    it("combines dash + offset via an array", () => {
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: three,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          distinguishBy: ["dash", "offset"],
          offsetStep: 1,
        }),
      );
      const b = result.current.layers[2]?.config as {
        dashArray?: number[];
        yOffset?: number;
      };
      expect(b.dashArray).toEqual([6, 4]); // index 1 dash
      expect(b.yOffset).toBe(1); // index 1 offset
    });
  });

  describe("layout: lanes", () => {
    const three: MultiSeries[] = [
      { id: "a", color: "#1", sample: () => 0 },
      { id: "b", color: "#2", sample: () => 0 },
      { id: "c", color: "#3", sample: () => 0 },
    ];

    it("assigns laneIndex/laneCount per series and suppresses the shared y-axis", () => {
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: three,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          layout: "lanes",
          laneGapPx: 4,
        }),
      );
      const [axisLayer, a, b, c] = result.current.layers;
      const axisCfg = axisLayer?.config as Record<string, unknown>;
      expect(axisCfg.yMode).toBe("fixed");
      expect(axisCfg.showYLabels).toBe(false);
      expect(axisCfg.showYGrid).toBe(false);
      const cfg = (l: typeof a) =>
        l?.config as { laneIndex?: number; laneCount?: number; laneGapPx?: number };
      expect(cfg(a)).toMatchObject({ laneIndex: 0, laneCount: 3, laneGapPx: 4 });
      expect(cfg(b)).toMatchObject({ laneIndex: 1, laneCount: 3 });
      expect(cfg(c)).toMatchObject({ laneIndex: 2, laneCount: 3 });
    });

    it("ignores distinguishBy:'offset' in lane mode (lanes supersede it)", () => {
      const { result } = renderHook(() =>
        useMultiSeriesChart({
          series: three,
          hz: 60,
          windowMs: 1000,
          timeOrigin: 0,
          layout: "lanes",
          distinguishBy: "offset",
          offsetStep: 2,
        }),
      );
      const c = result.current.layers[3]?.config as {
        yOffset?: number;
        laneIndex?: number;
      };
      expect(c.yOffset).toBeUndefined(); // offset not applied
      expect(c.laneIndex).toBe(2); // lane applied
    });

    it("overlay layout (default) sets no lane fields", () => {
      const { result } = renderHook(() =>
        useMultiSeriesChart({ series: three, hz: 60, windowMs: 1000, timeOrigin: 0 }),
      );
      const a = result.current.layers[1]?.config as { laneCount?: number };
      expect(a.laneCount).toBeUndefined();
    });
  });
});
