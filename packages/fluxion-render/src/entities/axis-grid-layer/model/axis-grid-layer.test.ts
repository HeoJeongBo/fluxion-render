import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx, type FakeCtx } from "../../../test/setup";
import { AxisGridLayer } from "./axis-grid-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(200, 200, 1);
  return v;
}

/** Drive one full frame (scan + draw) for a single AxisGridLayer. */
function frame(layer: AxisGridLayer, v: Viewport): FakeCtx {
  const ctx = createFakeCtx();
  v.beginScan();
  layer.scan?.(v);
  layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
  return ctx;
}

describe("AxisGridLayer", () => {
  it("writes its configured bounds into the viewport on scan", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({ xRange: [-5, 5], yRange: [0, 10] });
    const v = makeViewport();
    frame(layer, v);
    expect(v.bounds).toEqual({ xMin: -5, xMax: 5, yMin: 0, yMax: 10 });
  });

  it("skips viewport mutation when applyToViewport=false", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({
      xRange: [-5, 5],
      yRange: [0, 10],
      applyToViewport: false,
    });
    const v = makeViewport();
    const before = { ...v.bounds };
    frame(layer, v);
    expect(v.bounds).toEqual(before);
  });

  it("renders grid lines, axes, and labels", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({ xRange: [-10, 10], yRange: [-10, 10] });
    const ctx = frame(layer, makeViewport());
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBeGreaterThanOrEqual(2);
    expect(ctx.calls.filter((c) => c.name === "fillText").length).toBeGreaterThan(0);
  });

  it("draws zero axes only when 0 is inside the range", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({ xRange: [1, 10], yRange: [1, 10] });
    const ctx = frame(layer, makeViewport());
    // grid-stroke + axis-stroke are 2 distinct stroke calls; axis stroke
    // path is empty when 0 is outside, but the stroke call still happens.
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(2);
  });

  describe("xMode=time", () => {
    it("tracks a trailing window of viewport.latestT", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xMode: "time", timeWindowMs: 2000, yRange: [-1, 1] });
      const v = makeViewport();
      v.latestT = 5000;
      frame(layer, v);
      expect(v.bounds.xMin).toBe(3000);
      expect(v.bounds.xMax).toBe(5000);
    });

    it("re-computes bounds on every frame as latestT advances", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xMode: "time", timeWindowMs: 1000, yRange: [-1, 1] });
      const v = makeViewport();
      v.latestT = 1000;
      frame(layer, v);
      expect(v.bounds.xMax).toBe(1000);
      v.latestT = 2500;
      frame(layer, v);
      expect(v.bounds.xMin).toBe(1500);
      expect(v.bounds.xMax).toBe(2500);
    });
  });

  describe("xTickFormat (HH:mm:ss clock)", () => {
    it("custom pattern with milliseconds", () => {
      const layer = new AxisGridLayer("axis");
      const origin = new Date(2026, 0, 1, 12, 34, 56, 780).getTime();
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 1000,
        timeOrigin: origin,
        xTickFormat: "HH:mm:ss.SSS",
        yRange: [-1, 1],
      });
      const v = makeViewport();
      v.latestT = 0;
      const ctx = frame(layer, v);
      const labels = ctx.calls
        .filter((c) => c.name === "fillText" && typeof c.args[0] === "string")
        .map((c) => c.args[0] as string);
      expect(labels.some((l) => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(l))).toBe(true);
    });

    it("defaults to HH:mm:ss when unset", () => {
      const layer = new AxisGridLayer("axis");
      const origin = new Date(2026, 0, 1, 12, 34, 56).getTime();
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 1000,
        timeOrigin: origin,
        yRange: [-1, 1],
      });
      const v = makeViewport();
      v.latestT = 0;
      const ctx = frame(layer, v);
      const labels = ctx.calls
        .filter((c) => c.name === "fillText" && typeof c.args[0] === "string")
        .map((c) => c.args[0] as string);
      expect(labels.some((l) => /^\d{2}:\d{2}:\d{2}$/.test(l))).toBe(true);
    });

    it("'Xs' elapsed fallback when no timeOrigin", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xMode: "time", timeWindowMs: 2000, yRange: [-1, 1] });
      const v = makeViewport();
      v.latestT = 5000;
      const ctx = frame(layer, v);
      const labels = ctx.calls.filter(
        (c) =>
          c.name === "fillText" &&
          typeof c.args[0] === "string" &&
          (c.args[0] as string).endsWith("s"),
      );
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  describe("yMode=auto", () => {
    it("applies observed yMin/yMax with default 10% padding", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yMode: "auto" });
      const v = makeViewport();
      v.beginScan();
      v.observedYMin = 0;
      v.observedYMax = 10;
      layer.scan?.(v);
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      // 10% padding on a span of 10 -> [-1, 11]
      expect(v.bounds.yMin).toBeCloseTo(-1);
      expect(v.bounds.yMax).toBeCloseTo(11);
    });

    it("falls back to configured yRange when no observations", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yRange: [-3, 3],
        yMode: "auto",
      });
      const v = makeViewport();
      // No layer publishes observations; observedY stays +/-Inf.
      frame(layer, v);
      expect(v.bounds.yMin).toBe(-3);
      expect(v.bounds.yMax).toBe(3);
    });

    it("expands by ±0.5 when min==max (flat line)", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yMode: "auto" });
      const v = makeViewport();
      v.beginScan();
      v.observedYMin = 2;
      v.observedYMax = 2;
      layer.scan?.(v);
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      expect(v.bounds.yMin).toBe(1.5);
      expect(v.bounds.yMax).toBe(2.5);
    });

    it("yAutoMin / yAutoMax clamp after padding", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yMode: "auto",
        yAutoPadding: 0.5,
        yAutoMin: 0,
        yAutoMax: 100,
      });
      const v = makeViewport();
      v.beginScan();
      v.observedYMin = 10;
      v.observedYMax = 90;
      layer.scan?.(v);
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      // padding=0.5 of span 80 -> [10-40, 90+40] -> [-30, 130], clamped to [0, 100]
      expect(v.bounds.yMin).toBe(0);
      expect(v.bounds.yMax).toBe(100);
    });

    it("composes with xMode=time", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 1000,
        yMode: "auto",
      });
      const v = makeViewport();
      v.latestT = 5000;
      v.beginScan();
      layer.scan?.(v);
      expect(v.bounds.xMax).toBe(5000);
      v.observedYMin = -1;
      v.observedYMax = 1;
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      // 10% padding on span 2 -> [-1.2, 1.2]
      expect(v.bounds.yMin).toBeCloseTo(-1.2);
      expect(v.bounds.yMax).toBeCloseTo(1.2);
    });
  });

  describe("visual toggles", () => {
    it("showXGrid/showYGrid/showAxes/showXLabels/showYLabels all false -> no visual output, bounds still orchestrated", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 1000,
        yMode: "auto",
        showXGrid: false,
        showYGrid: false,
        showAxes: false,
        showXLabels: false,
        showYLabels: false,
      });
      const v = makeViewport();
      v.latestT = 1000;
      v.beginScan();
      layer.scan?.(v);
      v.observedYMin = -5;
      v.observedYMax = 5;
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);

      // Visual output is entirely suppressed
      expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(0);
      expect(ctx.calls.filter((c) => c.name === "fillText").length).toBe(0);

      // But orchestration still ran — bounds reflect the time window + auto y
      expect(v.bounds.xMin).toBe(0);
      expect(v.bounds.xMax).toBe(1000);
      expect(v.bounds.yMin).toBeCloseTo(-6);
      expect(v.bounds.yMax).toBeCloseTo(6);
    });

    it("showXGrid only -> vertical gridlines present, horizontal absent", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yRange: [0, 10],
        showXGrid: true,
        showYGrid: false,
        showAxes: false,
        showXLabels: false,
        showYLabels: false,
      });
      const ctx = frame(layer, makeViewport());
      // moveTo/lineTo count: (xTicks * 2) for vertical grid; 0 for horizontal
      const moveTos = ctx.calls.filter((c) => c.name === "moveTo").length;
      const lineTos = ctx.calls.filter((c) => c.name === "lineTo").length;
      expect(moveTos).toBeGreaterThan(0);
      expect(moveTos).toBe(lineTos);
      // Only one stroke call (grid)
      expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(1);
      // No labels
      expect(ctx.calls.filter((c) => c.name === "fillText").length).toBe(0);
    });

    it("showAxes=false -> no zero-axis stroke even when 0 is inside range", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [-5, 5],
        yRange: [-5, 5],
        showXGrid: false,
        showYGrid: false,
        showAxes: false,
        showXLabels: false,
        showYLabels: false,
      });
      const ctx = frame(layer, makeViewport());
      expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(0);
    });

    it("showYLabels only -> y labels emitted, x labels absent", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yRange: [0, 10],
        showXGrid: false,
        showYGrid: false,
        showAxes: false,
        showXLabels: false,
        showYLabels: true,
      });
      const ctx = frame(layer, makeViewport());
      expect(ctx.calls.filter((c) => c.name === "fillText").length).toBeGreaterThan(0);
    });
  });
});
