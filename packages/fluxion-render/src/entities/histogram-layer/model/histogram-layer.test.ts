import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { HistogramLayer } from "./histogram-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 });
  return v;
}

function values(...vs: number[]): ArrayBuffer {
  return new Float32Array(vs).buffer as ArrayBuffer;
}

function draw(layer: HistogramLayer, vp: Viewport) {
  const ctx = createFakeCtx();
  layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
  return ctx;
}

describe("HistogramLayer", () => {
  it("constructor assigns id", () => {
    expect(new HistogramLayer("h").id).toBe("h");
  });

  it("bins values and draws a bar per non-empty bin", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    layer.setData(values(1, 2, 8, 9), 4, vp); // 2 in bin0, 2 in bin1
    const ctx = draw(layer, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(2);
  });

  it("auto-computes range when none is configured", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 4 });
    const vp = makeViewport();
    layer.setData(values(0, 1, 2, 3, 4), 5, vp);
    const ctx = draw(layer, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(true);
  });

  it("scan reports the max bin count as the y extent", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    vp.beginScan();
    layer.setData(values(1, 1, 1, 9), 4, vp); // bin0=3, bin1=1
    expect(vp.observedYMax).toBeGreaterThanOrEqual(3);
    expect(vp.observedYMin).toBeLessThanOrEqual(0);
  });

  it("density mode normalises counts to fractions", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10], density: true });
    const vp = makeViewport();
    vp.beginScan();
    layer.setData(values(1, 1, 9, 9), 4, vp); // each bin 0.5
    expect(vp.observedYMax).toBeCloseTo(0.5);
  });

  it("flat data does not divide by zero", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 4 });
    const vp = makeViewport();
    layer.setData(values(5, 5, 5), 3, vp); // all identical → hi=lo guard
    expect(() => draw(layer, vp)).not.toThrow();
  });

  it("includes the right-edge value in the last bin", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    layer.setData(values(10), 1, vp); // exactly at hi → last bin
    const ctx = draw(layer, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(1);
  });

  it("drops values outside a fixed range", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    vp.beginScan();
    layer.setData(values(-5, 1, 15), 3, vp); // only 1 counts
    expect(vp.observedYMax).toBeGreaterThanOrEqual(1);
    expect(vp.observedYMax).toBeLessThan(3);
  });

  it("skips bars when the gap consumes the whole width", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10], gapPx: 100000 });
    const vp = makeViewport();
    layer.setData(values(1, 9), 2, vp);
    const ctx = draw(layer, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(0);
  });

  it("clamps binCount and gapPx and honours color", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 0, gapPx: -5, color: "#abcdef" });
    const vp = makeViewport();
    layer.setData(values(1, 2, 3), 3, vp); // binCount clamped to 1
    const ctx = draw(layer, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(1);
  });

  it("hidden layer skips scan and draw", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ visible: false, binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    vp.beginScan();
    const before = vp.observedYMax;
    layer.setData(values(1, 9), 2, vp);
    expect(vp.observedYMax).toBe(before);
    const ctx = draw(layer, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("empty data is a no-op", () => {
    const layer = new HistogramLayer("h");
    const vp = makeViewport();
    layer.setData(values(), 0, vp);
    const ctx = draw(layer, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("scan can run independently of setData", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    layer.setData(values(1, 9), 2, vp);
    vp.beginScan();
    expect(() => layer.scan(vp)).not.toThrow();
  });

  it("clearData and dispose empty the bins", () => {
    const layer = new HistogramLayer("h");
    layer.setConfig({ binCount: 2, range: [0, 10] });
    const vp = makeViewport();
    layer.setData(values(1, 9), 2, vp);
    layer.clearData();
    let ctx = draw(layer, vp);
    expect(ctx.calls.length).toBe(0);
    layer.setData(values(1, 9), 2, vp);
    layer.dispose();
    ctx = draw(layer, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("resize is a no-op", () => {
    expect(() => new HistogramLayer("h").resize(makeViewport())).not.toThrow();
  });
});
