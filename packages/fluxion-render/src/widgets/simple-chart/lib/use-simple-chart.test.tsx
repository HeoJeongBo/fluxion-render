import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../../features/host";
import { useSimpleChart } from "./use-simple-chart";

/** A host stub whose `line(id)` returns a handle with a spyable `push`. */
function makeStubHost() {
  const pushes: { id: string; t: number; y: number }[] = [];
  const host = {
    line: (id: string) => ({
      push: (s: { t: number; y: number }) => pushes.push({ id, ...s }),
    }),
  } as unknown as FluxionHost;
  return { host, pushes };
}

describe("useSimpleChart", () => {
  it("returns an [axis, line] pair wired for time mode", () => {
    const { result } = renderHook(() =>
      useSimpleChart({
        hz: 60,
        windowMs: 5000,
        timeOrigin: 1_000_000,
        sample: () => 0,
      }),
    );
    const [axis, line] = result.current.layers;
    expect(axis?.kind).toBe("axis-grid");
    expect(axis?.config).toMatchObject({ xMode: "time", timeWindowMs: 5000 });
    expect(line?.kind).toBe("line");
    expect(line?.id).toBe("line");
  });

  it("defaults timeOrigin to a stable value across re-renders", () => {
    const { result, rerender } = renderHook(
      (p: { color: string }) =>
        useSimpleChart({ hz: 60, windowMs: 1000, color: p.color, sample: () => 0 }),
      { initialProps: { color: "#abc" } },
    );
    const origin1 = (result.current.layers[0]?.config as { timeOrigin: number })
      .timeOrigin;
    rerender({ color: "#def" });
    const origin2 = (result.current.layers[0]?.config as { timeOrigin: number })
      .timeOrigin;
    expect(origin2).toBe(origin1);
  });

  describe("stream pump", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("pushes a numeric sample at tMs each tick", () => {
      const { host, pushes } = makeStubHost();
      const { result } = renderHook(() =>
        useSimpleChart({ hz: 100, windowMs: 1000, sample: (t) => t }),
      );
      act(() => result.current.setHost(host));
      act(() => {
        vi.advanceTimersByTime(25); // ~2-3 ticks at 100Hz (10ms)
      });
      expect(pushes.length).toBeGreaterThan(0);
      for (const p of pushes) {
        expect(p.id).toBe("line");
        expect(p.t).toBe(p.y); // numeric sample plotted at tMs
      }
    });

    it("pushes an explicit {t,y} sample and writes to the cache when provided", () => {
      const { host, pushes } = makeStubHost();
      const cachePush = vi.fn();
      const cache = { push: cachePush } as never;
      const { result } = renderHook(() =>
        useSimpleChart({
          hz: 100,
          windowMs: 1000,
          cache,
          sample: () => ({ t: 42, y: 7 }),
        }),
      );
      act(() => result.current.setHost(host));
      act(() => vi.advanceTimersByTime(15));
      expect(pushes.some((p) => p.t === 42 && p.y === 7)).toBe(true);
      expect(cachePush).toHaveBeenCalledWith("line", 42, 7);
    });
  });
});
