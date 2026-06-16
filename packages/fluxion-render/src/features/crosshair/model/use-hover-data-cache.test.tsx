import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  axisGridLayer,
  lineLayer,
} from "../../../widgets/fluxion-canvas/lib/layer-specs";
import type { FluxionLayerSpec } from "../../../widgets/fluxion-canvas/lib/use-fluxion-canvas";
import { useHoverDataCache } from "./use-hover-data-cache";

const LAYERS: FluxionLayerSpec[] = [
  axisGridLayer("axis", { xMode: "time" }),
  lineLayer("a", { color: "#4fc3f7" }),
  lineLayer("b", { color: "#ffb060" }),
];

describe("useHoverDataCache", () => {
  it("returns a stable cache instance across re-renders", () => {
    const { result, rerender } = renderHook(() => useHoverDataCache());
    const first = result.current.cache;
    rerender();
    expect(result.current.cache).toBe(first);
  });

  it("auto-registers non-axis layers with their colour", () => {
    const { result } = renderHook(() => useHoverDataCache({ layers: LAYERS }));
    const registered = result.current.cache.getLayers();
    const ids = registered.map((l) => l.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).not.toContain("axis"); // axis-grid is skipped
    expect(registered.find((l) => l.id === "a")?.color).toBe("#4fc3f7");
  });

  it("registration is idempotent across re-renders", () => {
    const { result, rerender } = renderHook(() => useHoverDataCache({ layers: LAYERS }));
    const countBefore = result.current.cache.getLayers().length;
    rerender();
    expect(result.current.cache.getLayers().length).toBe(countBefore);
  });

  it("push and pushBatch reach the cache (readable via findNearest)", () => {
    const { result } = renderHook(() => useHoverDataCache({ layers: LAYERS }));
    result.current.push("a", 100, 0.5);
    expect(result.current.cache.findNearest("a", 100, 0)).toEqual({ t: 100, y: 0.5 });

    result.current.pushBatch("b", new Float32Array([200, 1, 300, 2]));
    expect(result.current.cache.findNearest("b", 305, 0)).toEqual({ t: 300, y: 2 });
  });

  it("registers a hoverable layer that has no color (empty-color signature branch)", () => {
    const layers: FluxionLayerSpec[] = [
      axisGridLayer("axis", { xMode: "time" }),
      lineLayer("nocolor"), // no config.color
    ];
    const { result } = renderHook(() => useHoverDataCache({ layers }));
    const reg = result.current.cache.getLayers();
    expect(reg.map((l) => l.id)).toContain("nocolor");
  });

  it("applies per-id overrides on registration", () => {
    const { result } = renderHook(() =>
      useHoverDataCache({ layers: LAYERS, overrides: { a: { label: "Signal A" } } }),
    );
    expect(result.current.cache.getLayers().find((l) => l.id === "a")?.label).toBe(
      "Signal A",
    );
  });
});
