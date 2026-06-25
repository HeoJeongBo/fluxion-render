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
    for (let i = 0; i < 110; i++) {
      buf[i * 2] = i * 10;
      buf[i * 2 + 1] = 0;
    }
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
  describe("maxGapMs gap-breaking", () => {
    // Two bursts (2 samples each) separated by an 800 ms silence.
    const GAPPY = new Float32Array([0, 1, 100, 2, 1000, 3, 1100, 4]);

    it("gap breaks the staircase (second moveTo, no bridging segments)", () => {
      const layer = new StepChartLayer("step1");
      layer.setConfig({ capacity: 8, maxGapMs: 150 });
      const vp = makeViewport();
      layer.setData(GAPPY.buffer, 8, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // One subpath per burst; each burst has 1 step transition = 2 lineTo.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(2);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(4);
    });

    it("no maxGapMs draws bridging H+V segments (unchanged behavior)", () => {
      const layer = new StepChartLayer("step1");
      layer.setConfig({ capacity: 8 });
      const vp = makeViewport();
      layer.setData(GAPPY.buffer, 8, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // 4 samples fully connected: 1 moveTo + 2*(4-1) lineTo.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(6);
    });
  });

  describe("dashArray", () => {
    it("sets the dash before stroking and resets it after", () => {
      const layer = new StepChartLayer("s");
      layer.setConfig({ dashArray: [6, 4] });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2, 200, 3]).buffer, 6, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);

      const names = ctx.calls.map((c) => c.name);
      const setDash = ctx.calls.filter((c) => c.name === "setLineDash");
      expect(setDash[0]!.args[0]).toEqual([6, 4]);
      expect(setDash[1]!.args[0]).toEqual([]);
      const firstSet = names.indexOf("setLineDash");
      const stroke = names.indexOf("stroke");
      expect(firstSet).toBeLessThan(stroke);
      expect(names.lastIndexOf("setLineDash")).toBeGreaterThan(stroke);
    });

    it("does not call setLineDash when solid", () => {
      const layer = new StepChartLayer("s");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "setLineDash")).toBe(false);
    });
  });

  describe("yOffset", () => {
    it("shifts the staircase by yToPx(y + offset)", () => {
      const layer = new StepChartLayer("s");
      layer.setConfig({ yOffset: 4 });
      const vp = makeViewport(); // yMin -10, yMax 10
      layer.setData(new Float32Array([0, 0, 100, 0]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      const move = ctx.calls.find((c) => c.name === "moveTo")!;
      expect(move.args[1]).toBeCloseTo(vp.yToPx(4));
    });

    it("publishes the shifted y to observed extents", () => {
      const layer = new StepChartLayer("s");
      layer.setConfig({ yOffset: -2 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 3]).buffer, 4, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(-1); // 1 - 2
      expect(vp.observedYMax).toBeCloseTo(1); // 3 - 2
    });
  });

  describe("lane mode", () => {
    it("draws the staircase into its band without touching shared observed range", () => {
      const layer = new StepChartLayer("s");
      layer.setConfig({ laneIndex: 0, laneCount: 2, laneGapPx: 0 });
      const vp = makeViewport(); // height 400, no pad
      layer.setData(new Float32Array([0, 1, 100, 2, 200, 3]).buffer, 6, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY); // untouched
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // 2 lanes → top band is [0, 200]; every drawn y is within it.
      const ys = ctx.calls
        .filter((c) => c.name === "moveTo" || c.name === "lineTo")
        .map((c) => c.args[1] as number);
      for (const y of ys) expect(y).toBeLessThanOrEqual(200.001);
    });

    it("skips draw with no in-window samples", () => {
      const layer = new StepChartLayer("s");
      layer.setConfig({ laneIndex: 0, laneCount: 2 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 1, 100, 2]).buffer, 4, vp);
      vp.setBounds({ xMin: 9000, xMax: 9999, yMin: -10, yMax: 10 });
      vp.beginScan();
      layer.scan(vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
    });

    it("a flat series in a lane does not divide by zero", () => {
      const layer = new StepChartLayer("s");
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

  describe("draw decimation (decimate)", () => {
    function fillVarying(layer: StepChartLayer, vp: Viewport, n = 4000) {
      layer.setConfig({ capacity: n + 100 }); // retain all samples (no eviction)
      const buf = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        buf[i * 2] = (i * 5000) / n;
        buf[i * 2 + 1] = Math.sin(i * 0.1) * 5;
      }
      layer.setData(buf.buffer, buf.length, vp);
    }

    it("auto-decimates when oversampled (far fewer points than samples)", () => {
      const layer = new StepChartLayer("st1");
      const vp = makeViewport();
      fillVarying(layer, vp, 4000);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      const points = ctx.calls.filter(
        (c) => c.name === "moveTo" || c.name === "lineTo",
      ).length;
      expect(points).toBeGreaterThan(0);
      expect(points).toBeLessThan(4000);
    });

    it("decimate:false draws the full staircase (2 lineTo per sample)", () => {
      const layer = new StepChartLayer("st1");
      const vp = makeViewport();
      const n = 3000;
      layer.setConfig({ decimate: false, capacity: n + 100 });
      const buf = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        buf[i * 2] = (i * 5000) / n;
        buf[i * 2 + 1] = i % 2; // alternate so each step has H+V segments
      }
      layer.setData(buf.buffer, buf.length, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // staircase: 1 moveTo + 2 lineTo per subsequent sample.
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe((n - 1) * 2);
    });

    it("decimates in lane mode (band-normalized y)", () => {
      const layer = new StepChartLayer("st1");
      // dashArray exercises the decimated path's setLineDash branch too.
      layer.setConfig({ laneIndex: 0, laneCount: 2, dashArray: [4, 2] });
      const vp = makeViewport();
      fillVarying(layer, vp, 4000);
      vp.beginScan();
      layer.scan(vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      const ys = ctx.calls
        .filter((c) => c.name === "moveTo" || c.name === "lineTo")
        .map((c) => c.args[1] as number);
      expect(ys.length).toBeGreaterThan(0);
      for (const y of ys) expect(Number.isFinite(y)).toBe(true);
    });

    it("breaks the decimated path across a maxGapMs gap (extra moveTo)", () => {
      const layer = new StepChartLayer("st1");
      layer.setConfig({ maxGapMs: 5 });
      const vp = makeViewport();
      const n = 4000;
      const buf = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        // Two dense halves separated by a > 5ms gap at the midpoint.
        const half = i < n / 2 ? 0 : 2600;
        buf[i * 2] = half + (i % (n / 2)) * 0.5;
        buf[i * 2 + 1] = Math.sin(i * 0.1) * 5;
      }
      layer.setData(buf.buffer, buf.length, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // A gap forces a second subpath → at least 2 moveTo.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });
});
