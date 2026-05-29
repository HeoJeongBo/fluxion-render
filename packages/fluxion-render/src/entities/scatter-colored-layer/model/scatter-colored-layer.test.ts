import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { ScatterColoredLayer } from "./scatter-colored-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
  return v;
}

function makeSample(t: number, y: number, colorVal: number, sizeVal: number): number[] {
  return [t, y, colorVal, sizeVal];
}

describe("ScatterColoredLayer", () => {
  it("constructor assigns id", () => {
    const layer = new ScatterColoredLayer("sc1");
    expect(layer.id).toBe("sc1");
  });

  it("setConfig updates shape, minSize, maxSize, visible", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ shape: "square", minSize: 3, maxSize: 12, visible: true });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "rect" || c.name === "fill")).toBe(true);
  });

  it("setConfig clamps minSize and maxSize to minimum 1", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ minSize: 0, maxSize: 0 });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig colormap=viridis uses viridis LUT", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ colormap: "viridis" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig colormap=plasma uses plasma LUT", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ colormap: "plasma" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig colormap=hot uses hot LUT", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ colormap: "hot" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig colormap=gradient builds gradient LUT from minColor+maxColor", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ colormap: "gradient", minColor: "#0000ff", maxColor: "#ff0000" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig updates gradient LUT when minColor changes after colormap=gradient is set", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ colormap: "gradient", minColor: "#000000", maxColor: "#ffffff" });
    layer.setConfig({ minColor: "#ff0000" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 1.0, 1.0)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig updates gradient LUT when maxColor changes after colormap=gradient is set", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ colormap: "gradient", minColor: "#000000", maxColor: "#ffffff" });
    layer.setConfig({ maxColor: "#00ff00" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.0, 0.0)).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig auto-calculates capacity from retentionMs + maxHz", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ retentionMs: 5_000, maxHz: 10 });
    const vp = makeViewport();
    const buf = new Float32Array(56 * 4);
    for (let i = 0; i < 56; i++) {
      buf[i * 4 + 0] = i;
      buf[i * 4 + 1] = i;
      buf[i * 4 + 2] = 0.5;
      buf[i * 4 + 3] = 0.5;
    }
    layer.setData(buf.buffer, buf.length, vp);
    layer.setData(new Float32Array(makeSample(200, 77, 0.5, 0.5)).buffer, 4, vp);
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 200 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(77);
  });

  it("setData does nothing when length < 4", () => {
    const layer = new ScatterColoredLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 5, 0.5]).buffer, 3, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("setData advances viewport.latestT", () => {
    const layer = new ScatterColoredLayer("sc1");
    const vp = makeViewport();
    const data = new Float32Array([
      ...makeSample(100, 1, 0.2, 0.3),
      ...makeSample(300, 2, 0.5, 0.5),
    ]);
    layer.setData(data.buffer, 8, vp);
    expect(vp.latestT).toBe(300);
  });

  it("draw is no-op when ring is empty", () => {
    const layer = new ScatterColoredLayer("sc1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("draw is no-op when visible is false", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("draw renders circle shape with arc call", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ shape: "circle" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "arc")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });

  it("draw renders square shape with rect call", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ shape: "square" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "rect")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });

  it("draw filters points older than viewport.bounds.xMin", () => {
    const layer = new ScatterColoredLayer("sc1");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    const data = new Float32Array([
      ...makeSample(100, 1, 0.5, 0.5),
      ...makeSample(200, 2, 0.5, 0.5),
      ...makeSample(300, 3, 0.5, 0.5),
    ]);
    layer.setData(data.buffer, 12, vp);
    vp.setBounds({ xMin: 250, xMax: 5000, yMin: -10, yMax: 10 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "fill").length).toBe(1);
  });

  it("draw clamps colorValue to [0,1] for LUT index", () => {
    const layer = new ScatterColoredLayer("sc1");
    const vp = makeViewport();
    const data = new Float32Array([
      ...makeSample(100, 5, -0.5, 0.5),
      ...makeSample(200, 6, 1.5, 0.5),
    ]);
    layer.setData(data.buffer, 8, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  describe("scan", () => {
    it("updates observedYMin/Max for visible points", () => {
      const layer = new ScatterColoredLayer("sc1");
      const vp = makeViewport();
      const data = new Float32Array([
        ...makeSample(100, 5, 0.5, 0.5),
        ...makeSample(200, -3, 0.5, 0.5),
        ...makeSample(300, 8, 0.5, 0.5),
      ]);
      layer.setData(data.buffer, 12, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-3);
      expect(vp.observedYMax).toBeCloseTo(8);
    });

    it("skips scan when visible is false", () => {
      const layer = new ScatterColoredLayer("sc1");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array(makeSample(100, 99, 0.5, 0.5)).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("excludes points outside xMin", () => {
      const layer = new ScatterColoredLayer("sc1");
      layer.setConfig({ capacity: 16 });
      const vp = makeViewport();
      const data = new Float32Array([
        ...makeSample(100, 100, 0.5, 0.5),
        ...makeSample(300, 5, 0.5, 0.5),
      ]);
      layer.setData(data.buffer, 8, vp);
      vp.setBounds({ xMin: 200, xMax: 5000, yMin: -10, yMax: 200 });
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(5);
      expect(vp.observedYMax).toBeCloseTo(5);
    });

    it("leaves extents at Inf when ring is empty", () => {
      const layer = new ScatterColoredLayer("sc1");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  it("resize does not throw", () => {
    const layer = new ScatterColoredLayer("sc1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("clearData empties the ring buffer", () => {
    const layer = new ScatterColoredLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    layer.clearData();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });

  it("dispose clears the ring buffer", () => {
    const layer = new ScatterColoredLayer("sc1");
    const vp = makeViewport();
    layer.setData(new Float32Array(makeSample(100, 5, 0.5, 0.5)).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(false);
  });
});
