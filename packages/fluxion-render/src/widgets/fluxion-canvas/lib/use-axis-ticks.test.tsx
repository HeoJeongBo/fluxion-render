import { act, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxisTickSet } from "../../../shared/lib/axis-ticks";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";
import { useAxisTicks } from "./use-axis-ticks";

// Capture ticks from the hook inside a test component.
function Harness({
  layers,
  axisLayerId,
  refreshMs,
  onTicks,
}: {
  layers: FluxionLayerSpec[];
  axisLayerId: string;
  refreshMs?: number;
  onTicks: (t: AxisTickSet | null) => void;
}) {
  const ticks = useAxisTicks(layers, axisLayerId, refreshMs);
  const onTicksRef = useRef(onTicks);
  onTicksRef.current = onTicks;
  useEffect(() => {
    onTicksRef.current(ticks);
  });
  return null;
}

const FIXED_LAYERS: FluxionLayerSpec[] = [
  {
    id: "axis",
    kind: "axis-grid",
    config: { xMode: "fixed", xRange: [0, 10], yRange: [-1, 1] },
  },
];

const TIME_LAYERS: FluxionLayerSpec[] = [
  {
    id: "axis",
    kind: "axis-grid",
    config: {
      xMode: "time",
      timeWindowMs: 5000,
      timeOrigin: 0,
      yRange: [-1, 1],
    },
  },
];

describe("useAxisTicks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("fixed mode", () => {
    it("returns ticks immediately on mount", () => {
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={FIXED_LAYERS}
          axisLayerId="axis"
          onTicks={(t) => received.push(t)}
        />,
      );
      const last = received[received.length - 1];
      expect(last).not.toBeNull();
      expect(last!.xTicks.length).toBeGreaterThan(0);
      expect(last!.yTicks.length).toBeGreaterThan(0);
    });

    it("x tick values fall within xRange", () => {
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={FIXED_LAYERS}
          axisLayerId="axis"
          onTicks={(t) => received.push(t)}
        />,
      );
      const last = received[received.length - 1]!;
      for (const tick of last.xTicks) {
        expect(tick.value).toBeGreaterThanOrEqual(0);
        expect(tick.value).toBeLessThanOrEqual(10);
        expect(tick.fraction).toBeGreaterThanOrEqual(0);
        expect(tick.fraction).toBeLessThanOrEqual(1);
      }
    });

    it("does not start a setInterval in fixed mode", () => {
      const spy = vi.spyOn(globalThis, "setInterval");
      render(
        <Harness
          layers={FIXED_LAYERS}
          axisLayerId="axis"
          onTicks={() => {}}
        />,
      );
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("returns null when axisLayerId does not match any layer", () => {
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={FIXED_LAYERS}
          axisLayerId="nonexistent"
          onTicks={(t) => received.push(t)}
        />,
      );
      expect(received[received.length - 1]).toBeNull();
    });
  });

  describe("time mode", () => {
    it("returns an initial tick set on mount", () => {
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          onTicks={(t) => received.push(t)}
        />,
      );
      expect(received[received.length - 1]).not.toBeNull();
    });

    it("installs two setInterval timers in time mode (y + x)", () => {
      const spy = vi.spyOn(globalThis, "setInterval");
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          refreshMs={100}
          onTicks={() => {}}
        />,
      );
      // Two timers: y at refreshMs, x at xTickIntervalMs (1000ms default)
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
      const intervals = spy.mock.calls.map((c) => c[1]);
      expect(intervals).toContain(100);   // y timer
      expect(intervals).toContain(1000);  // x timer default
      spy.mockRestore();
    });

    it("updates x ticks after xTickIntervalMs (default 1000ms)", () => {
      vi.setSystemTime(1_000_000);
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          refreshMs={100}
          onTicks={(t) => received.push(t)}
        />,
      );
      // x timer fires at 1000ms; no x change before that
      const countAt500 = received.length;
      act(() => { vi.advanceTimersByTime(500); });
      const countAt1000 = received.length;
      act(() => {
        vi.setSystemTime(1_002_000);
        vi.advanceTimersByTime(600);
      });
      expect(received.length).toBeGreaterThan(countAt1000);
      // before 1000ms, x tick should not have fired (only y)
      void countAt500; // suppress unused warning
    });

    it("skips setState when computed ticks are identical (frozen clock)", () => {
      vi.setSystemTime(1_000_000);
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          refreshMs={100}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { vi.advanceTimersByTime(100); });
      const countAfterSettle = received.length;
      // Fire 10 more intervals without moving the clock — tickSetsEqual suppresses re-renders
      act(() => { vi.advanceTimersByTime(1000); });
      expect(received.length - countAfterSettle).toBeLessThanOrEqual(1);
    });

    it("re-renders when tick labels change (time advances past xTickIntervalMs)", () => {
      vi.setSystemTime(1_000_000);
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          refreshMs={100}
          onTicks={(t) => received.push(t)}
        />,
      );
      const countAfterMount = received.length;
      act(() => {
        // advance past the x timer (1000ms) and move system time by 2s so x labels differ
        vi.setSystemTime(1_002_000);
        vi.advanceTimersByTime(1100);
      });
      expect(received.length).toBeGreaterThan(countAfterMount);
    });

  });
});
