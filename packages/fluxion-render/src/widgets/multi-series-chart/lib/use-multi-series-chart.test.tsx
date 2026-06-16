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
});
