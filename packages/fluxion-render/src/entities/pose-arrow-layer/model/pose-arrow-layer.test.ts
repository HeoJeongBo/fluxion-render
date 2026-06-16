import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { PoseArrowLayer } from "./pose-arrow-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(1000, 200, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -1, yMax: 1 });
  return v;
}

describe("PoseArrowLayer", () => {
  it("no-op when buffer is empty", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("draws arrows after pushing samples", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    // [t, y, theta] stride=3
    layer.setData(new Float32Array([100, 0.0, 0]).buffer, 3, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });

  it("draws one arrow per sample", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    // 3 samples
    layer.setData(
      new Float32Array([100, 0.0, 0, 200, 0.5, Math.PI / 2, 300, -0.5, Math.PI]).buffer,
      9,
      vp,
    );
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // Each arrow: 1 moveTo (body), 1 stroke, 1 moveTo (head path not needed — uses fill)
    const strokes = ctx.calls.filter((c) => c.name === "stroke");
    const fills = ctx.calls.filter((c) => c.name === "fill");
    expect(strokes.length).toBe(3);
    expect(fills.length).toBe(3);
  });

  it("advances viewport.latestT", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    expect(vp.latestT).toBe(0);
    layer.setData(new Float32Array([500, 0.2, 0.5]).buffer, 3, vp);
    expect(vp.latestT).toBe(500);
    // Earlier t should not roll back latestT
    layer.setData(new Float32Array([100, 0.1, 0]).buffer, 3, vp);
    expect(vp.latestT).toBe(500);
  });

  it("filters samples outside viewport xMin", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0.0, 0, 200, 0.5, 0]).buffer, 6, vp);
    // Move window to exclude t=100
    vp.setBounds({ xMin: 150, xMax: 5000, yMin: -1, yMax: 1 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    const strokes = ctx.calls.filter((c) => c.name === "stroke");
    expect(strokes.length).toBe(1);
  });

  it("visible: false skips draw and scan", () => {
    const layer = new PoseArrowLayer("pose");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0.5, 0]).buffer, 3, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);

    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
    expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
  });

  it("scan publishes y extents for visible samples", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    vp.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
    layer.setData(
      new Float32Array([100, 0.8, 0, 200, -0.3, 1, 300, 0.5, 2]).buffer,
      9,
      vp,
    );
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMin).toBeCloseTo(-0.3);
    expect(vp.observedYMax).toBeCloseTo(0.8);
  });

  it("scan excludes samples outside x window", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 99, 0, 300, -0.5, 0]).buffer, 6, vp);
    vp.setBounds({ xMin: 200, xMax: 5000, yMin: -100, yMax: 100 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMin).toBeCloseTo(-0.5);
    expect(vp.observedYMax).toBeCloseTo(-0.5);
  });

  it("uses configured color", () => {
    const layer = new PoseArrowLayer("pose");
    layer.setConfig({ color: "#ff0000" });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 0]).buffer, 3, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#ff0000");
    expect(ctx.fillStyle).toBe("#ff0000");
  });

  it("auto-calculates capacity from retentionMs + maxHz", () => {
    const layer = new PoseArrowLayer("pose");
    // ceil(5 * 10 * 1.1) = 56
    layer.setConfig({ retentionMs: 5_000, maxHz: 10 });
    const vp = makeViewport();
    // Push capacity + 1 samples — first (y=99) should be evicted
    const cap = 56;
    const buf = new Float32Array((cap + 1) * 3);
    for (let i = 0; i <= cap; i++) {
      buf[i * 3] = i * 10;
      buf[i * 3 + 1] = i === 0 ? 99 : 0;
      buf[i * 3 + 2] = 0;
    }
    layer.setData(buf.buffer, buf.length, vp);
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 100 });
    vp.beginScan();
    layer.scan(vp);
    // y=99 from the first sample should be evicted
    expect(vp.observedYMax).toBeCloseTo(0);
  });

  it("applies arrowLength and arrowWidth config (clamped to minimums)", () => {
    const layer = new PoseArrowLayer("pose");
    // Below minimums -> clamped to 4 and 2.
    layer.setConfig({ arrowLength: 1, arrowWidth: 1 });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 0]).buffer, 3, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("setData ignores buffers shorter than one sample (length < 3)", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("clearData empties the ring buffer", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0.5, 0]).buffer, 3, vp);
    layer.clearData();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("dispose clears the ring buffer", () => {
    const layer = new PoseArrowLayer("pose");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0.5, 0]).buffer, 3, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });
});
