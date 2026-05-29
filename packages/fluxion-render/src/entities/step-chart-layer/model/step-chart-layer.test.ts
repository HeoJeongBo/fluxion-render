import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { StepChartLayer } from "./step-chart-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
  return v;
}

describe("StepChartLayer", () => {
  it("constructor assigns id", () => {
    const layer = new StepChartLayer("step1");
    expect(layer.id).toBe("step1");
  });

  it("setConfig updates color, lineWidth, visible", () => {
    const layer = new StepChartLayer("step1");
    layer.setConfig({ color: "#ff0000", lineWidth: 3, visible: true });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#ff0000");
    expect(ctx.lineWidth).toBe(3);
  });

  it("setConfig auto-calculates capacity from retentionMs + maxHz", () => {
    const layer = new StepChartLayer("step1");
    // ceil((5000/1000) * 20 * 1.1) = 110
    layer.setConfig({ retentionMs: 5_000, maxHz: 20 });
    const vp = makeViewport();
    // fill capacity=110 with y=0, then overflow 2 samples
    const buf = new Float32Array(110 * 2);
    for (let i = 0; i < 110; i++) { buf[i * 2] = i * 10; buf[i * 2 + 1] = 0; }
    layer.setData(buf.buffer, buf.length, vp);
    layer.setData(new Float32Array([2000, 77, 2100, -5]).buffer, 4, vp);
    vp.setBounds({ xMin: 0, xMax: 100000, yMin: -100, yMax: 200 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(77);
    expect(vp.observedYMin).toBeCloseTo(-5);
  });

  it("setData advances viewport.latestT", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    layer.setData(new Float32Array([50, 1, 250, 2]).buffer, 4, vp);
    expect(vp.latestT).toBe(250);
  });

  it("setData does nothing when length < 2", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    layer.setData(new Float32Array([1]).buffer, 1, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw is no-op when ring has fewer than 2 elements", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw is no-op when visible is false", () => {
    const layer = new StepChartLayer("step1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw produces step-shaped path: lineTo called twice per step after the first", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2, 200, 3]).buffer, 6, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(4);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("draw filters samples older than viewport.bounds.xMin", () => {
    const layer = new StepChartLayer("step1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2, 200, 3, 300, 4]).buffer, 8, vp);
    vp.setBounds({ xMin: 200, xMax: 5000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
  });

  it("draw skips stroke when all samples are outside the window", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(0);
  });

  describe("scan", () => {
    it("updates observedYMin/Max for visible samples", () => {
      const layer = new StepChartLayer("step1");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 5, 100, -3, 200, 8]).buffer, 6, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-3);
      expect(vp.observedYMax).toBeCloseTo(8);
    });

    it("skips scan when visible is false", () => {
      const layer = new StepChartLayer("step1");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 99, 100, -99]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("excludes samples outside xMin", () => {
      const layer = new StepChartLayer("step1");
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
      const layer = new StepChartLayer("step1");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  it("resize does not throw", () => {
    const layer = new StepChartLayer("step1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("clearData empties the ring buffer", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    layer.clearData();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("dispose clears the ring buffer", () => {
    const layer = new StepChartLayer("step1");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("accumulates samples across multiple setData calls", () => {
    const layer = new StepChartLayer("step1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
    layer.setData(new Float32Array([200, 3, 300, 4]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(6);
  });
});
