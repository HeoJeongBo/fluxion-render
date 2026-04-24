import { act, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../../features/host";
import type { AxisTickSet } from "../../../shared/lib/axis-ticks";
import type { SerializedTick } from "../../../shared/protocol";
import { useAxisTicks } from "./use-axis-ticks";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

// Minimal FluxionHost stub that lets tests drive onTickUpdate callbacks.
function makeHostStub(): FluxionHost & {
  _fireTickUpdate: (x: SerializedTick[], y: SerializedTick[]) => void;
} {
  const listeners: Array<(x: SerializedTick[], y: SerializedTick[]) => void> = [];
  return {
    onTickUpdate(cb: (x: SerializedTick[], y: SerializedTick[]) => void) {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    onBoundsChange() { return () => {}; },
    _fireTickUpdate(x: SerializedTick[], y: SerializedTick[]) {
      for (const fn of listeners) fn(x, y);
    },
  } as unknown as FluxionHost & { _fireTickUpdate: (x: SerializedTick[], y: SerializedTick[]) => void };
}

// Capture ticks from the hook inside a test component.
function Harness({
  layers,
  axisLayerId,
  refreshMs,
  host,
  onTicks,
}: {
  layers: FluxionLayerSpec[];
  axisLayerId: string;
  refreshMs?: number;
  host?: FluxionHost | null;
  onTicks: (t: AxisTickSet | null) => void;
}) {
  const ticks = useAxisTicks(layers, axisLayerId, refreshMs, host);
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

const SAMPLE_X: SerializedTick[] = [
  { value: 0, label: "00:00:00", fraction: 0 },
  { value: 1000, label: "00:00:01", fraction: 0.2 },
];
const SAMPLE_Y: SerializedTick[] = [
  { value: -1, label: "-1", fraction: 0 },
  { value: 0, label: "0", fraction: 0.5 },
  { value: 1, label: "1", fraction: 1 },
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
    it("returns an initial tick set on mount (fallback before first worker message)", () => {
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

    it("does not install setInterval timers in time mode (worker-driven)", () => {
      const spy = vi.spyOn(globalThis, "setInterval");
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          onTicks={() => {}}
        />,
      );
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("updates ticks when worker fires onTickUpdate", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      const countAfterMount = received.length;
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      expect(received.length).toBeGreaterThan(countAfterMount);
      const last = received[received.length - 1]!;
      expect(last.xTicks).toEqual(SAMPLE_X);
      expect(last.yTicks).toEqual(SAMPLE_Y);
    });

    it("skips setState when worker sends identical ticks (equality gate)", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      const countAfterFirst = received.length;
      // Fire again with identical data — state should not change
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      expect(received.length).toBe(countAfterFirst);
    });

    it("re-renders when worker sends different tick labels", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      const countAfterFirst = received.length;
      const updatedX: SerializedTick[] = [
        { value: 1000, label: "00:00:01", fraction: 0 },
        { value: 2000, label: "00:00:02", fraction: 0.2 },
      ];
      act(() => { host._fireTickUpdate(updatedX, SAMPLE_Y); });
      expect(received.length).toBeGreaterThan(countAfterFirst);
      expect(received[received.length - 1]!.xTicks).toEqual(updatedX);
    });

    it("applies xTickFormat function to raw values from worker", () => {
      const formatFn = (v: number) => `${v}ms`;
      const layersWithFn: FluxionLayerSpec[] = [
        {
          id: "axis",
          kind: "axis-grid",
          config: {
            xMode: "time",
            timeWindowMs: 5000,
            timeOrigin: 0,
            yRange: [-1, 1],
            xTickFormat: formatFn,
          },
        },
      ];
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={layersWithFn}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      // Worker sends empty labels when xTickFormat is a function
      const rawX: SerializedTick[] = [
        { value: 0, label: "", fraction: 0 },
        { value: 1000, label: "", fraction: 0.2 },
      ];
      act(() => { host._fireTickUpdate(rawX, SAMPLE_Y); });
      const last = received[received.length - 1]!;
      expect(last.xTicks[0]!.label).toBe("0ms");
      expect(last.xTicks[1]!.label).toBe("1000ms");
    });

    it("re-renders when fraction changes even if labels are the same", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      const countAfterFirst = received.length;
      // Same labels, different fraction
      const shiftedX: SerializedTick[] = SAMPLE_X.map((t) => ({ ...t, fraction: t.fraction + 0.1 }));
      act(() => { host._fireTickUpdate(shiftedX, SAMPLE_Y); });
      expect(received.length).toBeGreaterThan(countAfterFirst);
    });

    it("re-renders when only y ticks change", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      const countAfterFirst = received.length;
      const newY: SerializedTick[] = [
        { value: -2, label: "-2", fraction: 0 },
        { value: 2, label: "2", fraction: 1 },
      ];
      act(() => { host._fireTickUpdate(SAMPLE_X, newY); });
      expect(received.length).toBeGreaterThan(countAfterFirst);
      expect(received[received.length - 1]!.yTicks).toEqual(newY);
    });

    it("falls back to initialTicks when host is absent", () => {
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={null}
          onTicks={(t) => received.push(t)}
        />,
      );
      // No host → workerTicks stays null → initialTicks is returned
      const last = received[received.length - 1];
      expect(last).not.toBeNull();
      expect(last!.xTicks.length).toBeGreaterThan(0);
    });

    it("resets to initialTicks when host changes to null", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      const { rerender } = render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      expect(received[received.length - 1]!.xTicks).toEqual(SAMPLE_X);

      act(() => {
        rerender(
          <Harness
            layers={TIME_LAYERS}
            axisLayerId="axis"
            host={null}
            onTicks={(t) => received.push(t)}
          />,
        );
      });
      // workerTicks cleared — result is initialTicks (computed snapshot, not SAMPLE_X)
      const last = received[received.length - 1]!;
      expect(last.xTicks).not.toEqual(SAMPLE_X);
    });

    it("unsubscribes from old host when host changes", () => {
      const host1 = makeHostStub();
      const host2 = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      const { rerender } = render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host1}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host1._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });

      act(() => {
        rerender(
          <Harness
            layers={TIME_LAYERS}
            axisLayerId="axis"
            host={host2}
            onTicks={(t) => received.push(t)}
          />,
        );
      });
      // Snapshot length after host switch (rerender may trigger a render itself)
      const countAfterSwitch = received.length;

      // Firing old host after switch must NOT update state
      act(() => { host1._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      expect(received.length).toBe(countAfterSwitch);

      // But new host2 should still work
      const updatedX: SerializedTick[] = [
        { value: 2000, label: "00:00:02", fraction: 0 },
      ];
      act(() => { host2._fireTickUpdate(updatedX, SAMPLE_Y); });
      expect(received.length).toBeGreaterThan(countAfterSwitch);
    });

    it("does not call setState after unmount", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      const { unmount } = render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { unmount(); });
      const countAfterUnmount = received.length;
      // Should not throw or update state after unmount
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      expect(received.length).toBe(countAfterUnmount);
    });

    it("yTicksEqual: re-renders when y label changes (inner false branch)", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      const countAfterFirst = received.length;
      // Same length but different label at index 0 — yTicksEqual returns false mid-loop
      const differentLabel: SerializedTick[] = [
        { value: -1, label: "CHANGED", fraction: 0 },
        { value: 0, label: "0", fraction: 0.5 },
        { value: 1, label: "1", fraction: 1 },
      ];
      act(() => { host._fireTickUpdate(SAMPLE_X, differentLabel); });
      expect(received.length).toBeGreaterThan(countAfterFirst);
    });

    it("active guard: stale callback fired synchronously after unsub is ignored", () => {
      // Use a host stub where unsub does NOT remove the listener immediately,
      // simulating a race where the callback fires between active=false and removal.
      let storedCb: ((x: SerializedTick[], y: SerializedTick[]) => void) | null = null;
      const racingHost = {
        onTickUpdate(cb: (x: SerializedTick[], y: SerializedTick[]) => void) {
          storedCb = cb;
          // unsub is a no-op — listener stays registered
          return () => {};
        },
        onBoundsChange() { return () => {}; },
      } as unknown as FluxionHost;

      const received: (AxisTickSet | null)[] = [];
      const { unmount } = render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={racingHost}
          onTicks={(t) => received.push(t)}
        />,
      );

      // Unmount: cleanup runs → active = false (unsub is no-op so listener stays)
      act(() => { unmount(); });
      const countAfterUnmount = received.length;

      // Stale callback fires after active=false — must be ignored by the guard
      act(() => { storedCb!(SAMPLE_X, SAMPLE_Y); });
      expect(received.length).toBe(countAfterUnmount);
    });

    it("computeFromConfig: uses fallback xRange/yRange when not set", () => {
      const minimalLayers: FluxionLayerSpec[] = [
        {
          id: "axis",
          kind: "axis-grid",
          // No xRange, no yRange, no xMode → all defaults
          config: {},
        },
      ];
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={minimalLayers}
          axisLayerId="axis"
          onTicks={(t) => received.push(t)}
        />,
      );
      const last = received[received.length - 1]!;
      // Defaults: xRange [-1, 1], yRange [-1, 1]
      for (const tick of last.xTicks) {
        expect(tick.value).toBeGreaterThanOrEqual(-1);
        expect(tick.value).toBeLessThanOrEqual(1);
      }
    });

    it("computeFromConfig time mode: now=undefined path yields latestT=0", () => {
      // initialTicks is computed with Date.now() — here we verify time mode
      // with no timeOrigin so elapsed-seconds fallback is used
      const noOriginLayers: FluxionLayerSpec[] = [
        {
          id: "axis",
          kind: "axis-grid",
          config: { xMode: "time", timeWindowMs: 5000 },
        },
      ];
      const received: (AxisTickSet | null)[] = [];
      render(
        <Harness
          layers={noOriginLayers}
          axisLayerId="axis"
          onTicks={(t) => received.push(t)}
        />,
      );
      // Should not throw and should produce ticks
      expect(received[received.length - 1]).not.toBeNull();
    });

    it("switches from time mode to fixed mode: workerTicks cleared, fixedTicks returned", () => {
      const host = makeHostStub();
      const received: (AxisTickSet | null)[] = [];
      const { rerender } = render(
        <Harness
          layers={TIME_LAYERS}
          axisLayerId="axis"
          host={host}
          onTicks={(t) => received.push(t)}
        />,
      );
      act(() => { host._fireTickUpdate(SAMPLE_X, SAMPLE_Y); });
      expect(received[received.length - 1]!.xTicks).toEqual(SAMPLE_X);

      act(() => {
        rerender(
          <Harness
            layers={FIXED_LAYERS}
            axisLayerId="axis"
            host={host}
            onTicks={(t) => received.push(t)}
          />,
        );
      });
      const last = received[received.length - 1]!;
      // Fixed mode returns ticks from xRange [0, 10], not SAMPLE_X values
      for (const tick of last.xTicks) {
        expect(tick.value).toBeGreaterThanOrEqual(0);
        expect(tick.value).toBeLessThanOrEqual(10);
      }
    });
  });
});
