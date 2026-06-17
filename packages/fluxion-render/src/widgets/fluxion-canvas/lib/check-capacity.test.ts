import { describe, expect, it } from "vitest";
import { checkCapacity } from "./check-capacity";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

describe("checkCapacity", () => {
  it("returns no advisories when there is no time-window axis", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { xMode: "fixed" } },
      { id: "line", kind: "line", config: { capacity: 1 } },
    ];
    expect(checkCapacity(layers)).toEqual([]);
  });

  it("flags a streaming layer whose explicit capacity is too small", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { timeWindowMs: 5000 } },
      { id: "line", kind: "line", config: { capacity: 100 } }, // 5s*60Hz=300 needed
    ];
    const advisories = checkCapacity(layers);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]!.id).toBe("line");
    expect(advisories[0]!.capacity).toBe(100);
    expect(advisories[0]!.estimatedNeeded).toBe(300);
    expect(advisories[0]!.message).toContain("line");
  });

  it("does not flag a layer with adequate capacity", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { timeWindowMs: 5000 } },
      { id: "line", kind: "line", config: { capacity: 4096 } },
    ];
    expect(checkCapacity(layers)).toEqual([]);
  });

  it("derives capacity from retentionMs + maxHz and uses maxHz for the estimate", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { timeWindowMs: 10_000 } },
      // derived capacity = ceil(1 * 100 * 1.1) ≈ 111; needed = 10s * 100Hz = 1000
      { id: "line", kind: "line", config: { retentionMs: 1000, maxHz: 100 } },
    ];
    const advisories = checkCapacity(layers);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]!.capacity).toBe(111);
    expect(advisories[0]!.estimatedNeeded).toBe(1000);
  });

  it("falls back to the 2048 default capacity and respects assumedHz", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { timeWindowMs: 60_000 } },
      { id: "line", kind: "line" }, // default 2048; needed = 60s*120Hz=7200
    ];
    const advisories = checkCapacity(layers, { assumedHz: 120 });
    expect(advisories).toHaveLength(1);
    expect(advisories[0]!.capacity).toBe(2048);
    expect(advisories[0]!.estimatedNeeded).toBe(7200);
  });

  it("ignores non-streaming layers", () => {
    const layers: FluxionLayerSpec[] = [
      { id: "axis", kind: "axis-grid", config: { timeWindowMs: 5000 } },
      { id: "bar", kind: "bar", config: {} },
      { id: "heat", kind: "heatmap", config: {} },
    ];
    expect(checkCapacity(layers)).toEqual([]);
  });
});
