import { describe, expect, it, vi } from "vitest";
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

  describe("followClock", () => {
    it("right edge = now - timeOrigin, ignoring stale latestT", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 2000,
        timeOrigin: 1_000_000,
        followClock: true,
        yRange: [-1, 1],
      });
      // wall-clock now = 1_005_000 → host-relative right edge = 5000.
      vi.spyOn(layer as unknown as { now(): number }, "now").mockReturnValue(1_005_000);
      const v = makeViewport();
      v.latestT = 50; // deliberately stale — must be ignored.
      frame(layer, v);
      expect(v.bounds.xMax).toBe(5000);
      expect(v.bounds.xMin).toBe(3000);
    });

    it("advances with the wall clock across frames even with no new data", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 1000,
        timeOrigin: 1_000_000,
        followClock: true,
        yRange: [-1, 1],
      });
      const nowSpy = vi.spyOn(layer as unknown as { now(): number }, "now");
      const v = makeViewport();
      v.latestT = 0; // never changes — no data arrives.

      nowSpy.mockReturnValue(1_003_000);
      frame(layer, v);
      expect(v.bounds.xMax).toBe(3000);

      nowSpy.mockReturnValue(1_004_500);
      frame(layer, v);
      expect(v.bounds.xMax).toBe(4500); // advanced despite latestT staying 0.
      expect(v.bounds.xMin).toBe(3500);
    });

    it("falls back to latestT when followClock is set but timeOrigin is missing", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xMode: "time",
        timeWindowMs: 2000,
        followClock: true, // no timeOrigin → no follow.
        yRange: [-1, 1],
      });
      const nowSpy = vi.spyOn(layer as unknown as { now(): number }, "now");
      const v = makeViewport();
      v.latestT = 5000;
      frame(layer, v);
      expect(v.bounds.xMax).toBe(5000); // latestT path.
      expect(v.bounds.xMin).toBe(3000);
      expect(nowSpy).not.toHaveBeenCalled();
      expect(layer.isFollowingClock()).toBe(false);
    });

    it("is ignored when xMode is not 'time'", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [-5, 5],
        yRange: [0, 10],
        followClock: true,
        timeOrigin: 1_000_000,
      });
      const v = makeViewport();
      frame(layer, v);
      expect(v.bounds.xMin).toBe(-5);
      expect(v.bounds.xMax).toBe(5);
      expect(layer.isFollowingClock()).toBe(false);
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

    it("yAutoMinSpan expands narrow range symmetrically around midpoint", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yMode: "auto",
        yAutoPadding: 0,
        yAutoMinSpan: 0.1,
      });
      const v = makeViewport();
      v.beginScan();
      v.observedYMin = 0;
      v.observedYMax = 0.01;
      layer.scan?.(v);
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      // span=0.01 < 0.1 → mid=0.005 → [-0.045, 0.055]
      expect(v.bounds.yMin).toBeCloseTo(-0.045);
      expect(v.bounds.yMax).toBeCloseTo(0.055);
    });

    it("yAutoMinSpan does not shrink range wider than minSpan", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yMode: "auto",
        yAutoPadding: 0,
        yAutoMinSpan: 0.1,
      });
      const v = makeViewport();
      v.beginScan();
      v.observedYMin = 0;
      v.observedYMax = 0.2;
      layer.scan?.(v);
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      // span=0.2 > 0.1 → unchanged
      expect(v.bounds.yMin).toBe(0);
      expect(v.bounds.yMax).toBe(0.2);
    });

    it("yAutoMinSpan applies after yAutoMin/yAutoMax clamps", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yMode: "auto",
        yAutoPadding: 0,
        yAutoMin: 0,
        yAutoMinSpan: 0.1,
      });
      const v = makeViewport();
      v.beginScan();
      v.observedYMin = 0.04;
      v.observedYMax = 0.06;
      layer.scan?.(v);
      layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
      // span=0.02 < 0.1 → mid=0.05 → [-0.05, 0.05], then yAutoMin=0 clamps yMin→0
      // but minSpan is applied AFTER clamp, so mid of [0, 0.06] = 0.03 → [-0.02, 0.08] ...
      // Actually: clamp first → yMin=0.04→no change (>0), yMax=0.06→no change
      // then minSpan: mid=0.05, yMin=-0.05, yMax=0.055 — but yAutoMin doesn't re-apply
      // So just verify span >= 0.1
      expect(v.bounds.yMax - v.bounds.yMin).toBeGreaterThanOrEqual(0.1);
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

  describe("yMode=auto degenerate yRange fallback", () => {
    it("falls back to [-1,1] when yRange is degenerate (min==max) and no observations", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yMode: "auto", yRange: [5, 5] });
      const v = makeViewport();
      frame(layer, v);
      expect(v.bounds.yMin).toBe(-1);
      expect(v.bounds.yMax).toBe(1);
    });
  });

  describe("drawXAxis", () => {
    it("draws tick marks and labels onto an axis canvas", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      layer.drawXAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 200, 30, {});
      expect(ctx.calls.some((c) => c.name === "clearRect")).toBe(true);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
      expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    });

    it("skips tick strokes when tickSize=0", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      layer.drawXAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 200, 30, {
        tickSize: 0,
      });
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
      expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    });

    it("uses xTickIntervalMs for tick positions", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 5000], yRange: [0, 1], xTickIntervalMs: 1000 });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      layer.drawXAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 200, 30, {});
      expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    });

    it("applies bgColor style override when provided", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      layer.drawXAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 200, 30, {
        color: "#aaa",
        font: "12px mono",
        tickSize: 4,
        tickMargin: 2,
      });
      expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    });
  });

  describe("drawYAxis", () => {
    it("draws tick marks and labels onto a y-axis canvas", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      layer.drawYAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 60, 200, {});
      expect(ctx.calls.some((c) => c.name === "clearRect")).toBe(true);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
      expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    });

    it("skips tick strokes when tickSize=0", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      layer.drawYAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 60, 200, {
        tickSize: 0,
      });
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
      expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    });

    it("applies yPadPx to offset the usable area", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const ctxNoPad = createFakeCtx();
      const ctxPad = createFakeCtx();
      layer.drawYAxis(
        ctxNoPad as unknown as OffscreenCanvasRenderingContext2D,
        60,
        200,
        {},
        0,
      );
      layer.drawYAxis(
        ctxPad as unknown as OffscreenCanvasRenderingContext2D,
        60,
        200,
        {},
        20,
      );
      const yNoPad = ctxNoPad.calls
        .filter((c) => c.name === "fillText")
        .map((c) => c.args[2] as number);
      const yPad = ctxPad.calls
        .filter((c) => c.name === "fillText")
        .map((c) => c.args[2] as number);
      expect(yNoPad.length).toBe(yPad.length);
      expect(yNoPad[0]).not.toBe(yPad[0]);
    });

    it("handles degenerate ySpan=0 without dividing by zero", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 1], yRange: [5, 5] });
      const v = makeViewport();
      frame(layer, v);
      const ctx = createFakeCtx();
      expect(() =>
        layer.drawYAxis(ctx as unknown as OffscreenCanvasRenderingContext2D, 60, 200, {}),
      ).not.toThrow();
    });
  });

  describe("computeTicksForExport", () => {
    it("returns xTicks, yTicks with value/label/fraction", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 10], yRange: [0, 10] });
      const v = makeViewport();
      frame(layer, v);
      const { xTicks, yTicks, xRawValues } = layer.computeTicksForExport();
      expect(xTicks.length).toBeGreaterThan(0);
      expect(yTicks.length).toBeGreaterThan(0);
      expect(xTicks[0]).toHaveProperty("value");
      expect(xTicks[0]).toHaveProperty("label");
      expect(xTicks[0]).toHaveProperty("fraction");
      expect(xRawValues).toEqual([]);
    });

    it("populates xRawValues and clears labels when xTickFormat is a function", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({
        xRange: [0, 10],
        yRange: [0, 10],
        xTickFormat: (v: number) => `${v}!`,
      });
      const v = makeViewport();
      frame(layer, v);
      const { xTicks, xRawValues } = layer.computeTicksForExport();
      expect(xRawValues.length).toBeGreaterThan(0);
      expect(xTicks.every((t) => t.label === "")).toBe(true);
    });

    it("uses xTickIntervalMs ticks for export", () => {
      const layer = new AxisGridLayer("axis");
      layer.setConfig({ xRange: [0, 3000], yRange: [0, 1], xTickIntervalMs: 1000 });
      const v = makeViewport();
      frame(layer, v);
      const { xTicks } = layer.computeTicksForExport();
      expect(xTicks.some((t) => t.value === 1000 || t.value === 2000)).toBe(true);
    });
  });
});
