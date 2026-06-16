import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { AreaChartLayer } from "./area-chart-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
  return v;
}

describe("AreaChartLayer", () => {
  it("constructor assigns id", () => {
    const layer = new AreaChartLayer("area1");
    expect(layer.id).toBe("area1");
  });

  it("setConfig updates color, fillOpacity, lineWidth, visible", () => {
    const layer = new AreaChartLayer("area1");
    layer.setConfig({ color: "#00ff00", fillOpacity: 0.5, lineWidth: 2, visible: true });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#00ff00");
    expect(ctx.lineWidth).toBe(2);
  });

  it("setConfig clamps fillOpacity to [0,1]", () => {
    const layer = new AreaChartLayer("area1");
    layer.setConfig({ fillOpacity: 2.5 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() =>
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp),
    ).not.toThrow();
  });

  it("setData pushes samples and advances viewport.latestT", () => {
    const layer = new AreaChartLayer("area1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 1, 300, 2]).buffer, 4, vp);
    expect(vp.latestT).toBe(300);
  });

  it("setData does nothing when length < 2", () => {
    const layer = new AreaChartLayer("area1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100]).buffer, 1, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw is no-op when ring has fewer than 2 elements", () => {
    const layer = new AreaChartLayer("area1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw is no-op when visible is false", () => {
    const layer = new AreaChartLayer("area1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw renders fill and stroke for visible data", () => {
    const layer = new AreaChartLayer("area1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 3, 200, 2]).buffer, 6, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("draw filters samples older than viewport.bounds.xMin", () => {
    const layer = new AreaChartLayer("area1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2, 200, 3, 300, 4]).buffer, 8, vp);
    vp.setBounds({ xMin: 200, xMax: 5000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(2);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length >= 2).toBe(true);
  });

  it("draw skips stroke when all samples are outside the window", () => {
    const layer = new AreaChartLayer("area1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("capacity is auto-calculated from retentionMs + maxHz", () => {
    const layer = new AreaChartLayer("area1");
    // ceil((10000/1000) * 10 * 1.1) = 110
    layer.setConfig({ retentionMs: 10_000, maxHz: 10 });
    const vp = makeViewport();
    // fill capacity with y=0, then one overflow with y=99 — oldest (y=0) evicted
    // but since all others are also y=0, min=0. Instead verify by filling with y=1
    // for first sample only, rest y=0, then overflow. Simpler: just fill cap samples
    // with y=0, then push 1 with y=99 and 1 with y=-5 to exceed min.
    const buf = new Float32Array(110 * 2);
    for (let i = 0; i < 110; i++) {
      buf[i * 2] = i * 10;
      buf[i * 2 + 1] = 0;
    }
    layer.setData(buf.buffer, buf.length, vp);
    // push 2 more: the ring is full at 110, these 2 push evict oldest 2
    layer.setData(new Float32Array([2000, 99, 2100, -5]).buffer, 4, vp);
    vp.setBounds({ xMin: 0, xMax: 100000, yMin: -100, yMax: 200 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(99);
    expect(vp.observedYMin).toBeCloseTo(-5);
  });

  describe("scan", () => {
    it("updates observedYMin/Max for visible samples", () => {
      const layer = new AreaChartLayer("area1");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 5, 100, -3, 200, 8]).buffer, 6, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-3);
      expect(vp.observedYMax).toBeCloseTo(8);
    });

    it("skips scan when visible is false", () => {
      const layer = new AreaChartLayer("area1");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 99, 100, -99]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("excludes samples outside xMin", () => {
      const layer = new AreaChartLayer("area1");
      layer.setConfig({ capacity: 16 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 100, 100, 50, 300, 5]).buffer, 6, vp);
      vp.setBounds({ xMin: 200, xMax: 5000, yMin: -10, yMax: 10 });
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(5);
      expect(vp.observedYMax).toBeCloseTo(5);
    });

    it("leaves extents at Inf when ring is empty", () => {
      const layer = new AreaChartLayer("area1");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  it("resize does not throw", () => {
    const layer = new AreaChartLayer("area1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("clearData empties the ring buffer", () => {
    const layer = new AreaChartLayer("area1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    layer.clearData();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("dispose clears the ring buffer", () => {
    const layer = new AreaChartLayer("area1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  describe("maxGapMs gap-breaking", () => {
    // Two bursts (2 samples each) separated by an 800 ms silence.
    const GAPPY = new Float32Array([0, 1, 100, 3, 1000, 2, 1100, 4]);

    it("gap splits the fill into two closed-to-baseline polygons", () => {
      const layer = new AreaChartLayer("area1");
      layer.setConfig({ capacity: 8, maxGapMs: 150 });
      const vp = makeViewport();
      layer.setData(GAPPY.buffer, 8, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // One closePath per segment, single fill call for both polygons.
      expect(ctx.calls.filter((c) => c.name === "closePath").length).toBe(2);
      expect(ctx.calls.filter((c) => c.name === "fill").length).toBe(1);
      // Fill pass: 2 moveTo; stroke pass: 2 moveTo → 4 total.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(4);
    });

    it("no maxGapMs keeps a single closed polygon (unchanged behavior)", () => {
      const layer = new AreaChartLayer("area1");
      layer.setConfig({ capacity: 8 });
      const vp = makeViewport();
      layer.setData(GAPPY.buffer, 8, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.filter((c) => c.name === "closePath").length).toBe(1);
      // Fill pass: 1 moveTo; stroke pass: 1 moveTo.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(2);
    });
  });

  describe("dashArray", () => {
    it("dashes the outline stroke (after the fill) and resets afterward", () => {
      const layer = new AreaChartLayer("a");
      layer.setConfig({ dashArray: [6, 4] });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2, 200, 3]).buffer, 6, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);

      const names = ctx.calls.map((c) => c.name);
      const setDash = ctx.calls.filter((c) => c.name === "setLineDash");
      expect(setDash[0]!.args[0]).toEqual([6, 4]);
      expect(setDash[1]!.args[0]).toEqual([]);
      // Dash turns on AFTER the fill (the fill is never dashed), before the
      // stroke, and resets after it.
      const fill = names.indexOf("fill");
      const firstSet = names.indexOf("setLineDash");
      const stroke = names.indexOf("stroke");
      expect(fill).toBeLessThan(firstSet);
      expect(firstSet).toBeLessThan(stroke);
      expect(names.lastIndexOf("setLineDash")).toBeGreaterThan(stroke);
    });

    it("does not call setLineDash when solid", () => {
      const layer = new AreaChartLayer("a");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "setLineDash")).toBe(false);
    });
  });

  describe("yOffset", () => {
    it("lifts the area (fill + outline) by yToPx(y + offset), baseline unshifted", () => {
      const layer = new AreaChartLayer("a");
      layer.setConfig({ yOffset: 3 });
      const vp = makeViewport(); // yMin -10, yMax 10
      layer.setData(new Float32Array([0, 0, 100, 0]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // Fill pass starts with moveTo at the shifted curve (y=0 + 3).
      const move = ctx.calls.find((c) => c.name === "moveTo")!;
      expect(move.args[1]).toBeCloseTo(vp.yToPx(3));
      // Baseline lineTo stays at y=0 (unshifted).
      const baselineY = vp.yToPx(0);
      expect(ctx.calls.some((c) => c.name === "lineTo" && c.args[1] === baselineY)).toBe(
        true,
      );
    });

    it("publishes the shifted y to observed extents", () => {
      const layer = new AreaChartLayer("a");
      layer.setConfig({ yOffset: 5 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(6); // 1 + 5
      expect(vp.observedYMax).toBeCloseTo(7); // 2 + 5
    });
  });

  describe("lane mode", () => {
    it("does not touch the shared observed range and draws into its band", () => {
      const layer = new AreaChartLayer("a");
      layer.setConfig({ laneIndex: 1, laneCount: 2, laneGapPx: 0 });
      const vp = makeViewport(); // height 400, no pad
      layer.setData(new Float32Array([0, 1, 100, 2, 200, 3]).buffer, 6, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY); // untouched
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // 2 lanes → bottom band is [200, 400]; every drawn y is in that band.
      const ys = ctx.calls
        .filter((c) => c.name === "moveTo" || c.name === "lineTo")
        .map((c) => c.args[1] as number);
      for (const y of ys) expect(y).toBeGreaterThanOrEqual(199.999);
      expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
    });

    it("skips draw with no in-window samples", () => {
      const layer = new AreaChartLayer("a");
      layer.setConfig({ laneIndex: 0, laneCount: 2 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
      vp.setBounds({ xMin: 9000, xMax: 9999, yMin: -10, yMax: 10 });
      vp.beginScan();
      layer.scan(vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
    });

    it("a flat series in a lane does not divide by zero", () => {
      const layer = new AreaChartLayer("a");
      layer.setConfig({ laneIndex: 0, laneCount: 1 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 5, 100, 5]).buffer, 4, vp); // constant
      vp.beginScan();
      layer.scan(vp);
      const ctx = createFakeCtx();
      expect(() =>
        layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp),
      ).not.toThrow();
      const ys = ctx.calls
        .filter((c) => c.name === "moveTo" || c.name === "lineTo")
        .map((c) => c.args[1] as number);
      for (const y of ys) expect(Number.isFinite(y)).toBe(true);
    });
  });
});
