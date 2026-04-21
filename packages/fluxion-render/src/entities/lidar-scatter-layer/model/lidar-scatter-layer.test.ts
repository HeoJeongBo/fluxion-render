import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { LidarScatterLayer } from "./lidar-scatter-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(100, 100, 1);
  v.setBounds({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
  return v;
}

describe("LidarScatterLayer", () => {
  it("no-op when buffer is empty", () => {
    const layer = new LidarScatterLayer("l");
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, makeViewport());
    expect(ctx.calls.find((c) => c.name === "rect")).toBeUndefined();
  });

  it("draws one rect per point via counting-sort batching (stride=4)", () => {
    const layer = new LidarScatterLayer("l");
    layer.setConfig({ pointSize: 2, intensityMax: 1 });
    const vp = makeViewport();
    const data = new Float32Array([0, 0, 0, 0.1, 1, 1, 0, 0.5, -1, -1, 0, 0.9]);
    layer.setData(data.buffer, data.length, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(3);
    // Each non-empty bucket issues one beginPath + fill. With 3 distinct
    // intensities there can be up to 3 cycles.
    const fills = ctx.calls.filter((c) => c.name === "fill").length;
    expect(fills).toBeGreaterThanOrEqual(1);
    expect(fills).toBeLessThanOrEqual(3);
  });

  it("solid color config batches into a single fill call", () => {
    const layer = new LidarScatterLayer("l");
    layer.setConfig({ stride: 4, pointSize: 1, color: "#ff0000" });
    const vp = makeViewport();
    const data = new Float32Array([0, 0, 0, 0, 1, 1, 0, 0.5, 2, 2, 0, 0.9]);
    layer.setData(data.buffer, data.length, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.fillStyle).toBe("rgb(255,0,0)");
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(3);
    expect(ctx.calls.filter((c) => c.name === "fill").length).toBe(1);
  });

  it("respects custom stride (2 = x,y only, no intensity)", () => {
    const layer = new LidarScatterLayer("l");
    layer.setConfig({ stride: 2, pointSize: 1 });
    const vp = makeViewport();
    const data = new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]);
    layer.setData(data.buffer, data.length, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(4);
  });

  it("handles 30k points without throwing and emits rects for every one", () => {
    const layer = new LidarScatterLayer("l");
    layer.setConfig({ stride: 4, pointSize: 2, intensityMax: 1 });
    const vp = makeViewport();
    const count = 30_000;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const o = i * 4;
      const angle = (i / count) * Math.PI * 2;
      data[o] = Math.cos(angle) * 5;
      data[o + 1] = Math.sin(angle) * 5;
      data[o + 2] = 0;
      data[o + 3] = (i / count) % 1;
    }
    layer.setData(data.buffer, data.length, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(count);
  });

  it("reuses scratch buffers on repeat draws", () => {
    const layer = new LidarScatterLayer("l");
    layer.setConfig({ stride: 4, pointSize: 1, intensityMax: 1 });
    const vp = makeViewport();
    const data = new Float32Array(1000 * 4);
    layer.setData(data.buffer, data.length, vp);
    const ctx1 = createFakeCtx();
    layer.draw(ctx1 as unknown as OffscreenCanvasRenderingContext2D, vp);
    const ctx2 = createFakeCtx();
    layer.draw(ctx2 as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx1.calls.filter((c) => c.name === "rect").length).toBe(1000);
    expect(ctx2.calls.filter((c) => c.name === "rect").length).toBe(1000);
  });

  describe("scratch buffer shrink", () => {
    it("shrinks buffer when point count drops below 25% of capacity", () => {
      const layer = new LidarScatterLayer("l");
      layer.setConfig({ stride: 4, pointSize: 1, intensityMax: 1 });
      const vp = makeViewport();

      // First draw with large count — allocates a large scratch buffer
      const bigCount = 4096;
      const bigData = new Float32Array(bigCount * 4);
      layer.setData(bigData.buffer, bigData.length, vp);
      const ctx1 = createFakeCtx();
      layer.draw(ctx1 as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx1.calls.filter((c) => c.name === "rect").length).toBe(bigCount);

      // Second draw with count < 25% of capacity — should trigger shrink
      const smallCount = 100; // 100 < 4096 * 0.25 = 1024... use floor(4096/4)-1
      const smallData = new Float32Array(smallCount * 4);
      layer.setData(smallData.buffer, smallData.length, vp);
      const ctx2 = createFakeCtx();
      layer.draw(ctx2 as unknown as OffscreenCanvasRenderingContext2D, vp);
      // All points must still be drawn correctly after shrink
      expect(ctx2.calls.filter((c) => c.name === "rect").length).toBe(smallCount);
    });

    it("does not shrink below the 1024 floor", () => {
      const layer = new LidarScatterLayer("l");
      layer.setConfig({ stride: 4, pointSize: 1, intensityMax: 1 });
      const vp = makeViewport();

      // Allocate at exactly the floor (1024)
      const data1 = new Float32Array(1024 * 4);
      layer.setData(data1.buffer, data1.length, vp);
      const ctx1 = createFakeCtx();
      layer.draw(ctx1 as unknown as OffscreenCanvasRenderingContext2D, vp);

      // Draw with very few points — should NOT shrink below 1024
      const data2 = new Float32Array(4); // 1 point
      layer.setData(data2.buffer, data2.length, vp);
      const ctx2 = createFakeCtx();
      // Must not throw and must still draw the 1 point
      expect(() =>
        layer.draw(ctx2 as unknown as OffscreenCanvasRenderingContext2D, vp),
      ).not.toThrow();
      expect(ctx2.calls.filter((c) => c.name === "rect").length).toBe(1);
    });

    it("correctly draws after a shrink-then-grow cycle", () => {
      const layer = new LidarScatterLayer("l");
      layer.setConfig({ stride: 4, pointSize: 1, intensityMax: 1 });
      const vp = makeViewport();

      // Grow to 8000
      const big = new Float32Array(8000 * 4);
      layer.setData(big.buffer, big.length, vp);
      layer.draw(
        createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D,
        vp,
      );

      // Shrink trigger (< 25% of 8000 ≈ 2000)
      const small = new Float32Array(50 * 4);
      layer.setData(small.buffer, small.length, vp);
      layer.draw(
        createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D,
        vp,
      );

      // Grow again — must re-allocate and draw all points
      const big2 = new Float32Array(6000 * 4);
      layer.setData(big2.buffer, big2.length, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.filter((c) => c.name === "rect").length).toBe(6000);
    });
  });

  it("dispose clears data", () => {
    const layer = new LidarScatterLayer("l");
    const vp = makeViewport();
    const data = new Float32Array([0, 0, 0, 0.5]);
    layer.setData(data.buffer, data.length, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.find((c) => c.name === "rect")).toBeUndefined();
  });
});
