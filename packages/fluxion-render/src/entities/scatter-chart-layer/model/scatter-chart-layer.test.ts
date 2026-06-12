import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { ScatterChartLayer } from "./scatter-chart-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
  return v;
}

describe("ScatterChartLayer", () => {
  it("constructor assigns id", () => {
    const layer = new ScatterChartLayer("sc1");
    expect(layer.id).toBe("sc1");
  });

  it("setConfig updates color, pointSize, shape, visible", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ color: "#ff0000", pointSize: 5, shape: "circle", visible: true });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3, 200, 5]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.fillStyle).toBe("#ff0000");
  });

  it("setConfig clamps pointSize to minimum 1", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ pointSize: 0 });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3]).buffer, 2, vp);
    const ctx = createFakeCtx();
    expect(() =>
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp),
    ).not.toThrow();
  });

  it("setConfig updates capacity via explicit value", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 4 });
    const vp = makeViewport();
    for (let i = 0; i < 5; i++) {
      layer.setData(new Float32Array([i * 10, i]).buffer, 2, vp);
    }
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 100 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(4);
  });

  it("setConfig auto-calculates capacity from retentionMs + maxHz", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ retentionMs: 5_000, maxHz: 10 });
    const vp = makeViewport();
    const buf = new Float32Array(56 * 2);
    for (let i = 0; i < 56; i++) {
      buf[i * 2] = i;
      buf[i * 2 + 1] = i;
    }
    layer.setData(buf.buffer, buf.length, vp);
    layer.setData(new Float32Array([200, 99]).buffer, 2, vp);
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 200 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(99);
  });

  it("retentionMs without maxHz does not change capacity", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 2 });
    layer.setConfig({ retentionMs: 10_000 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1]).buffer, 2, vp);
    layer.setData(new Float32Array([100, 2]).buffer, 2, vp);
    layer.setData(new Float32Array([200, 3]).buffer, 2, vp);
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 100 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(3);
    expect(vp.observedYMin).toBeCloseTo(2);
  });

  it("setData does nothing when length < 2", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100]).buffer, 1, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("setData advances viewport.latestT", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([50, 1, 300, 2]).buffer, 4, vp);
    expect(vp.latestT).toBe(300);
  });

  it("setData does not roll back latestT with earlier timestamp", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([500, 1]).buffer, 2, vp);
    layer.setData(new Float32Array([100, 2]).buffer, 2, vp);
    expect(vp.latestT).toBe(500);
  });

  it("draw is no-op when ring has fewer than 2 elements", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("draw is no-op when visible is false", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("draw renders square points using rect calls", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ shape: "square" });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3, 200, 5]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(2);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });

  it("draw renders circle points using arc calls", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ shape: "circle" });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3, 200, 5]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBe(2);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });

  it("draw filters points older than viewport.bounds.xMin", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2, 200, 3, 300, 4]).buffer, 8, vp);
    vp.setBounds({ xMin: 200, xMax: 5000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(2);
  });

  it("draw is no-op when all points are outside window", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(0);
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBe(0);
  });

  it("draw accumulates samples across multiple setData calls", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    layer.setData(new Float32Array([200, 3, 300, 4]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(4);
  });

  describe("scan", () => {
    it("updates observedYMin/Max for visible samples", () => {
      const layer = new ScatterChartLayer("sc1");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 5, 100, -3, 200, 8]).buffer, 6, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-3);
      expect(vp.observedYMax).toBeCloseTo(8);
    });

    it("skips scan when visible is false", () => {
      const layer = new ScatterChartLayer("sc1");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 99, 100, -99]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("excludes samples outside xMin", () => {
      const layer = new ScatterChartLayer("sc1");
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
      const layer = new ScatterChartLayer("sc1");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("leaves extents untouched when all samples are outside the window", () => {
      const layer = new ScatterChartLayer("sc1");
      layer.setConfig({ capacity: 8 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
      vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -10, yMax: 10 });
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  it("resize does not throw", () => {
    const layer = new ScatterChartLayer("sc1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("clearData empties the ring buffer", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3, 200, 5]).buffer, 4, vp);
    layer.clearData();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("dispose clears the ring buffer", () => {
    const layer = new ScatterChartLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3, 200, 5]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("ring buffer caps at capacity and drops oldest samples", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 3 });
    const vp = makeViewport();
    layer.setData(
      new Float32Array([0, 0, 100, 1, 200, 2, 300, 3, 400, 4]).buffer,
      10,
      vp,
    );
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(4);
    expect(vp.observedYMin).toBeCloseTo(2);
  });

  it("draw filters circle points older than viewport.bounds.xMin", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ shape: "circle", capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2, 200, 3, 300, 4]).buffer, 8, vp);
    vp.setBounds({ xMin: 200, xMax: 5000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBe(2);
  });

  it("setConfig does not replace ring when capacity is unchanged", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 2048 });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 3, 200, 5]).buffer, 4, vp);
    layer.setConfig({ capacity: 2048 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(2);
  });

  it("setConfig with only retentionMs and no maxHz leaves capacity unchanged", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ capacity: 4 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1]).buffer, 2, vp);
    layer.setData(new Float32Array([100, 2]).buffer, 2, vp);
    layer.setData(new Float32Array([200, 3]).buffer, 2, vp);
    layer.setData(new Float32Array([300, 4]).buffer, 2, vp);
    layer.setData(new Float32Array([400, 5]).buffer, 2, vp);
    layer.setConfig({ retentionMs: 5000 });
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(5);
  });

  it("draw circle is no-op when all points are outside window", () => {
    const layer = new ScatterChartLayer("sc1");
    layer.setConfig({ shape: "circle" });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBe(0);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });
});
