import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { LineChartLayer } from "./line-chart-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(1000, 100, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -1, yMax: 1 });
  return v;
}

describe("LineChartLayer (streaming)", () => {
  it("no-op when fewer than 2 samples have been pushed", () => {
    const layer = new LineChartLayer("l");
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, makeViewport());
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("accumulates [t,y] samples across multiple setData calls", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 8 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 0.5]).buffer, 4, vp);
    layer.setData(new Float32Array([200, -0.5, 300, 0.8]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // 4 samples -> 1 moveTo + 3 lineTos
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(3);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("advances viewport.latestT to the newest timestamp", () => {
    const layer = new LineChartLayer("l");
    const vp = makeViewport();
    expect(vp.latestT).toBe(0);
    layer.setData(new Float32Array([100, 0.1, 250, 0.2, 900, 0.3]).buffer, 6, vp);
    expect(vp.latestT).toBe(900);
    // An earlier batch must not roll latestT backwards
    layer.setData(new Float32Array([50, 0.0]).buffer, 2, vp);
    expect(vp.latestT).toBe(900);
  });

  it("overflow keeps most recent samples (ring buffer)", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 3 });
    const vp = makeViewport();
    layer.setData(
      new Float32Array([0, 0, 100, 1, 200, 2, 300, 3, 400, 4]).buffer,
      10,
      vp,
    );
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // capacity 3 -> 1 moveTo + 2 lineTos
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
  });

  it("respects color + lineWidth config", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ color: "#ff00aa", lineWidth: 3 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 0.5]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#ff00aa");
    expect(ctx.lineWidth).toBe(3);
  });

  it("draw filters samples older than viewport.bounds.xMin", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    // Push 5 samples at t = 0, 100, 200, 300, 400
    layer.setData(
      new Float32Array([0, 0, 100, 0.1, 200, 0.2, 300, 0.3, 400, 0.4]).buffer,
      10,
      vp,
    );
    // Retarget the viewport to the trailing 200ms window
    vp.setBounds({ xMin: 200, xMax: 400, yMin: -1, yMax: 1 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // Only samples at t = 200, 300, 400 remain visible -> 1 moveTo + 2 lineTo
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
  });

  it("draw skips stroke entirely when every sample is outside the window", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 1, 200, 2]).buffer, 6, vp);
    // Window starts in the future — nothing visible
    vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -1, yMax: 1 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(0);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(0);
  });

  describe("scan (y auto-fit support)", () => {
    it("publishes visible-window min/max to viewport.observedYMin/Max", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 16 });
      const vp = makeViewport();
      vp.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
      layer.setData(
        new Float32Array([100, 0.1, 200, -0.5, 300, 1.2, 400, 0.3]).buffer,
        8,
        vp,
      );
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBeCloseTo(-0.5);
      expect(vp.observedYMax).toBeCloseTo(1.2);
    });

    it("excludes samples outside the current x window", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 16 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 100, 100, 50, 200, -20, 300, 5]).buffer, 8, vp);
      // Only samples with t >= 150 should contribute
      vp.setBounds({ xMin: 150, xMax: 500, yMin: -100, yMax: 100 });
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBeCloseTo(-20);
      expect(vp.observedYMax).toBeCloseTo(5);
    });

    it("leaves observed extents at +/-Inf when ring is empty", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("leaves observed extents untouched when every sample is outside the window", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 8 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1, 200, 2]).buffer, 6, vp);
      vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -1, yMax: 1 });
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("two layers merge their observations into a single aggregate", () => {
      const a = new LineChartLayer("a");
      const b = new LineChartLayer("b");
      const vp = makeViewport();
      vp.setBounds({ xMin: 0, xMax: 1000, yMin: -100, yMax: 100 });
      a.setData(new Float32Array([100, 1, 200, 2, 300, 3]).buffer, 6, vp);
      b.setData(new Float32Array([150, -5, 250, 10, 350, 0]).buffer, 6, vp);
      vp.beginScan();
      a.scan?.(vp);
      b.scan?.(vp);
      expect(vp.observedYMin).toBeCloseTo(-5);
      expect(vp.observedYMax).toBeCloseTo(10);
    });
  });

  describe("capacity via retentionMs + maxHz", () => {
    it("auto-calculates capacity from retentionMs and maxHz", () => {
      const layer = new LineChartLayer("l");
      // ceil(10 * 60 * 1.1) = 660
      layer.setConfig({ retentionMs: 10_000, maxHz: 60 });
      const vp = makeViewport();
      // Fill 660 samples then push 1 more — oldest should be dropped (ring wraps)
      const buf = new Float32Array(660 * 2);
      for (let i = 0; i < 660; i++) { buf[i * 2] = i; buf[i * 2 + 1] = 0; }
      layer.setData(buf.buffer, buf.length, vp);
      const extra = new Float32Array([700, 9]);
      layer.setData(extra.buffer, 2, vp);
      vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
      vp.beginScan();
      layer.scan?.(vp);
      // y=9 should be visible; y=0 from very first sample is dropped
      expect(vp.observedYMax).toBeCloseTo(9);
    });

    it("explicit capacity takes priority over retentionMs+maxHz", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 500, retentionMs: 10_000, maxHz: 60 });
      const vp = makeViewport();
      // Fill 500 + 1 samples — ring wraps at 500, not 660
      const buf = new Float32Array(500 * 2);
      for (let i = 0; i < 500; i++) { buf[i * 2] = i; buf[i * 2 + 1] = 1; }
      layer.setData(buf.buffer, buf.length, vp);
      layer.setData(new Float32Array([600, 5]).buffer, 2, vp);
      vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMax).toBeCloseTo(5);
    });

    it("retentionMs alone without maxHz leaves capacity unchanged", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 100 });
      layer.setConfig({ retentionMs: 10_000 }); // no maxHz → no-op
      const vp = makeViewport();
      // Fill 100 samples + 1 overflow — ring capacity should still be 100
      const buf = new Float32Array(100 * 2);
      for (let i = 0; i < 100; i++) { buf[i * 2] = i; buf[i * 2 + 1] = 0; }
      layer.setData(buf.buffer, buf.length, vp);
      layer.setData(new Float32Array([200, 7]).buffer, 2, vp);
      vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
      vp.beginScan();
      layer.scan?.(vp);
      // capacity=100 so first sample was dropped and y=7 is present
      expect(vp.observedYMax).toBeCloseTo(7);
    });
  });

  describe("visible flag", () => {
    it("visible: false skips draw", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
    });

    it("visible: false skips scan (y extents untouched)", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      vp.setBounds({ xMin: 0, xMax: 1000, yMin: -100, yMax: 100 });
      layer.setData(new Float32Array([0, 99, 100, -99]).buffer, 4, vp);
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("toggling visible back to true resumes draw", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
      layer.setConfig({ visible: false });
      layer.setConfig({ visible: true });
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    });
  });

  it("dispose clears the ring buffer", () => {
    const layer = new LineChartLayer("l");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });
});
