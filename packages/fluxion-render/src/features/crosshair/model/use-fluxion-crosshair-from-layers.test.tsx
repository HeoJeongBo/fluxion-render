import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  axisGridLayer,
  lineLayer,
} from "../../../widgets/fluxion-canvas/lib/layer-specs";
import type { FluxionLayerSpec } from "../../../widgets/fluxion-canvas/lib/use-fluxion-canvas";
import type { HoverDataCache } from "./hover-data-cache";

// Capture the options the wrapper forwards to the underlying hook.
const received: { opts?: unknown } = {};
vi.mock("./use-fluxion-crosshair", () => ({
  useFluxionCrosshair: (opts: unknown) => {
    received.opts = opts;
    return { chartRef: { current: null }, state: { position: null, points: [] } };
  },
}));

// Imported AFTER the mock so it picks up the mocked dependency.
const { useFluxionCrosshairFromLayers } = await import(
  "./use-fluxion-crosshair-from-layers"
);

const cache = {} as HoverDataCache;
const host = { hostId: "h" } as never;

describe("useFluxionCrosshairFromLayers", () => {
  it("derives xMode/timeWindowMs/timeOrigin from the matching axis-grid spec", () => {
    const layers: FluxionLayerSpec[] = [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 4000,
        timeOrigin: 1_000_000,
        yPadPx: 8,
      }),
      lineLayer("s", { color: "#abc" }),
    ];
    renderHook(() => useFluxionCrosshairFromLayers({ host, cache, layers }));
    expect(received.opts).toMatchObject({
      xMode: "time",
      timeWindowMs: 4000,
      timeOrigin: 1_000_000,
      yPadPx: 8,
    });
  });

  it("falls back to fixed defaults when no axis-grid spec matches", () => {
    const layers: FluxionLayerSpec[] = [lineLayer("s", { color: "#abc" })];
    renderHook(() =>
      useFluxionCrosshairFromLayers({ host, cache, layers, axisLayerId: "missing" }),
    );
    expect(received.opts).toMatchObject({ xMode: "fixed" });
    expect((received.opts as { timeWindowMs?: number }).timeWindowMs).toBeUndefined();
  });

  it("an explicit yPadPx overrides the axis spec value", () => {
    const layers: FluxionLayerSpec[] = [
      axisGridLayer("axis", { xMode: "time", yPadPx: 8 }),
    ];
    renderHook(() => useFluxionCrosshairFromLayers({ host, cache, layers, yPadPx: 2 }));
    expect((received.opts as { yPadPx?: number }).yPadPx).toBe(2);
  });
});
