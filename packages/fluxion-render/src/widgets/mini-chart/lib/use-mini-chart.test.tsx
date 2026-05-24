import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMiniChart } from "./use-mini-chart";

describe("useMiniChart", () => {
  it("returns an [axis, line] pair with required time-mode wiring", () => {
    const { result } = renderHook(() =>
      useMiniChart({ timeWindowMs: 5000, timeOrigin: 1_000_000 }),
    );
    const [axis, line] = result.current.layers;
    expect(axis?.kind).toBe("axis-grid");
    expect(axis?.config).toMatchObject({
      xMode: "time",
      timeWindowMs: 5000,
      timeOrigin: 1_000_000,
      yMode: "auto",
    });
    expect(line?.kind).toBe("line");
  });

  it("uses default ids when none provided", () => {
    const { result } = renderHook(() =>
      useMiniChart({ timeWindowMs: 1000, timeOrigin: 0 }),
    );
    expect(result.current.layers[0]?.id).toBe("axis");
    expect(result.current.layers[1]?.id).toBe("line");
  });

  it("respects custom layer ids", () => {
    const { result } = renderHook(() =>
      useMiniChart({
        timeWindowMs: 1000,
        timeOrigin: 0,
        layerId: "signal",
        axisLayerId: "ax",
      }),
    );
    expect(result.current.layers[0]?.id).toBe("ax");
    expect(result.current.layers[1]?.id).toBe("signal");
  });

  it("derives capacity from sampleHz * timeWindowMs when capacity isn't set", () => {
    const { result } = renderHook(() =>
      useMiniChart({ timeWindowMs: 5000, timeOrigin: 0, sampleHz: 20 }),
    );
    // ceil(5 * 20 * 1.5) = 150
    expect((result.current.layers[1]?.config as { capacity: number }).capacity).toBe(150);
  });

  it("explicit capacity wins over sampleHz", () => {
    const { result } = renderHook(() =>
      useMiniChart({
        timeWindowMs: 5000,
        timeOrigin: 0,
        sampleHz: 20, // would imply 150
        capacity: 1024,
      }),
    );
    expect((result.current.layers[1]?.config as { capacity: number }).capacity).toBe(1024);
  });

  it("axis override extends the default config (xMode kept)", () => {
    const { result } = renderHook(() =>
      useMiniChart({
        timeWindowMs: 1000,
        timeOrigin: 0,
        axis: { showXLabels: false, gridDashArray: [3, 3] },
      }),
    );
    expect(result.current.layers[0]?.config).toMatchObject({
      xMode: "time",
      showXLabels: false,
      gridDashArray: [3, 3],
    });
  });

  it("memoises the layers reference across re-renders when inputs are equal", () => {
    const { result, rerender } = renderHook(
      (props: { color: string }) =>
        useMiniChart({ timeWindowMs: 1000, timeOrigin: 0, color: props.color }),
      { initialProps: { color: "#abc" } },
    );
    const first = result.current.layers;
    rerender({ color: "#abc" });
    expect(result.current.layers).toBe(first);
    rerender({ color: "#def" });
    expect(result.current.layers).not.toBe(first);
  });
});
