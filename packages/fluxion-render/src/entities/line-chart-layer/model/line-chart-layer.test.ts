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
