import { describe, expect, it } from "vitest";
import { legendFromLayers } from "./legend-from-layers";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

describe("legendFromLayers", () => {
  it("derives one item per colored data layer, labeled by config.label", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid" },
      { id: "a", kind: "line", config: { color: "#f00", label: "Series A" } },
      { id: "b", kind: "area", config: { color: "#0f0" } }, // no label → id
    ];
    expect(legendFromLayers(layers)).toEqual([
      { color: "#f00", label: "Series A" },
      { color: "#0f0", label: "b" },
    ]);
  });

  it("skips axis-grid and reference-line layers", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { gridColor: "#333" } },
      { id: "ref", kind: "reference-line", config: { y: 0, color: "#999" } },
      { id: "line", kind: "line", config: { color: "#fff" } },
    ];
    expect(legendFromLayers(layers)).toEqual([{ color: "#fff", label: "line" }]);
  });

  it("skips layers without a color", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "a", kind: "line" }, // no config
      { id: "b", kind: "line", config: {} }, // no color
      { id: "c", kind: "line", config: { color: "#abc" } },
    ];
    expect(legendFromLayers(layers)).toEqual([{ color: "#abc", label: "c" }]);
  });

  it("returns an empty array when no layers qualify", () => {
    expect(legendFromLayers([{ id: "axis", kind: "axis-grid" }])).toEqual([]);
  });
});
