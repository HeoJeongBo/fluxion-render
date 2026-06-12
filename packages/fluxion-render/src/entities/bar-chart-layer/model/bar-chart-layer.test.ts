import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { BarChartLayer } from "./bar-chart-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 1000, yMin: -50, yMax: 100 });
  return v;
}

describe("BarChartLayer", () => {
  it("constructor assigns id", () => {
    const layer = new BarChartLayer("bar1");
    expect(layer.id).toBe("bar1");
  });

  it("setConfig updates color, barWidth, layout, xRange, visible", () => {
    const layer = new BarChartLayer("bar1");
    layer.setConfig({
      color: "#ff0000",
      barWidth: 12,
      layout: "y",
      xRange: [0, 100],
      visible: false,
    });
    const vp = makeViewport();
    const data = new Float32Array([10, 20, 30]);
    layer.setData(data.buffer, 3, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("setConfig clamps barWidth to minimum 1", () => {
    const layer = new BarChartLayer("bar1");
    layer.setConfig({ barWidth: 0 });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 50]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(true);
  });

  it("setData stores data and draw renders bars in xy layout", () => {
    const layer = new BarChartLayer("bar1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 20, 200, 40, 300, 60]).buffer, 6, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(3);
  });

  it("draw is no-op when data is empty", () => {
    const layer = new BarChartLayer("bar1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("draw skips when visible is false", () => {
    const layer = new BarChartLayer("bar1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 20, 200, 40]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("draw applies configured color", () => {
    const layer = new BarChartLayer("bar1");
    layer.setConfig({ color: "#abcdef" });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 20]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.fillStyle).toBe("#abcdef");
  });

  describe("layout: y", () => {
    it("draws one bar per y value with inferred x from xRange", () => {
      const layer = new BarChartLayer("bar1");
      layer.setConfig({ layout: "y", xRange: [0, 200] });
      const vp = makeViewport();
      layer.setData(new Float32Array([10, 20, 30, 40]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(4);
    });

    it("handles single-element y layout (step=0)", () => {
      const layer = new BarChartLayer("bar1");
      layer.setConfig({ layout: "y", xRange: [50, 50] });
      const vp = makeViewport();
      layer.setData(new Float32Array([42]).buffer, 1, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(1);
    });
  });

  describe("scan", () => {
    it("updates observedYMin/Max from xy data", () => {
      const layer = new BarChartLayer("bar1");
      const vp = makeViewport();
      vp.beginScan();
      layer.setData(new Float32Array([100, 30, 200, -10, 300, 80]).buffer, 6, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-10);
      expect(vp.observedYMax).toBeCloseTo(80);
    });

    it("always includes zero as baseline in scan", () => {
      const layer = new BarChartLayer("bar1");
      const vp = makeViewport();
      layer.setData(new Float32Array([100, 10, 200, 20]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(0);
    });

    it("skips scan when visible is false", () => {
      const layer = new BarChartLayer("bar1");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array([100, 99, 200, -99]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("skips scan when data is empty", () => {
      const layer = new BarChartLayer("bar1");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("updates observedYMin/Max from y layout data", () => {
      const layer = new BarChartLayer("bar1");
      layer.setConfig({ layout: "y", xRange: [0, 100] });
      const vp = makeViewport();
      layer.setData(new Float32Array([5, -3, 8]).buffer, 3, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-3);
      expect(vp.observedYMax).toBeCloseTo(8);
    });
  });

  it("resize does not throw", () => {
    const layer = new BarChartLayer("bar1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("dispose clears data so draw becomes no-op", () => {
    const layer = new BarChartLayer("bar1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 20, 200, 40]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("setData scan runs automatically (sets observedYMin/Max before draw)", () => {
    const layer = new BarChartLayer("bar1");
    const vp = makeViewport();
    vp.beginScan();
    layer.setData(new Float32Array([100, 70]).buffer, 2, vp);
    expect(vp.observedYMin).toBe(0);
    expect(vp.observedYMax).toBeCloseTo(70);
  });

  it("negative-only data includes zero so yMin does not go positive", () => {
    const layer = new BarChartLayer("bar1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, -5, 200, -20]).buffer, 4, vp);
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBe(0);
    expect(vp.observedYMin).toBeCloseTo(-20);
  });
});
