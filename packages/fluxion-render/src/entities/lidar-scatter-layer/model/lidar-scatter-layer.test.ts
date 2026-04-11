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
