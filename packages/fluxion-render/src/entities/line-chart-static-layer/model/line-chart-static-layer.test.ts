import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { LineChartStaticLayer } from "./line-chart-static-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(100, 100, 1);
  v.setBounds({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 });
  return v;
}

describe("LineChartStaticLayer", () => {
  it("no-op when data is empty or too short", () => {
    const layer = new LineChartStaticLayer("l");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.find((c) => c.name === "beginPath")).toBeUndefined();

    layer.setData(new Float32Array([1]).buffer, 1, vp);
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.find((c) => c.name === "beginPath")).toBeUndefined();
  });

  it("xy layout emits one moveTo + (n-1) lineTos", () => {
    const layer = new LineChartStaticLayer("l");
    layer.setConfig({ layout: "xy", color: "#fff", lineWidth: 2 });
    const vp = makeViewport();
    const data = new Float32Array([0, 0, 1, 1, 2, 4, 3, 9]);
    layer.setData(data.buffer, data.length, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    const moveCount = ctx.calls.filter((c) => c.name === "moveTo").length;
    const lineCount = ctx.calls.filter((c) => c.name === "lineTo").length;
    expect(moveCount).toBe(1);
    expect(lineCount).toBe(3);
    expect(ctx.strokeStyle).toBe("#fff");
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("y-only layout emits (n-1) lineTos across the x range", () => {
    const layer = new LineChartStaticLayer("l");
    layer.setConfig({ layout: "y" });
    const vp = makeViewport();
    const data = new Float32Array([0, 1, 2, 3, 4]);
    layer.setData(data.buffer, data.length, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(4);
  });

  it("setData replaces (not appends) on each call", () => {
    const layer = new LineChartStaticLayer("l");
    layer.setConfig({ layout: "xy" });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 1, 1, 2, 2, 3, 3]).buffer, 8, vp);
    layer.setData(new Float32Array([0, 5, 10, 5]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // 2 points -> 1 moveTo + 1 lineTo (not 4 accumulated)
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(1);
  });

  it("does not touch viewport.latestT", () => {
    const layer = new LineChartStaticLayer("l");
    const vp = makeViewport();
    vp.latestT = 42;
    layer.setData(new Float32Array([0, 0, 1, 1]).buffer, 4, vp);
    expect(vp.latestT).toBe(42);
  });

  it("dispose clears data", () => {
    const layer = new LineChartStaticLayer("l");
    const vp = makeViewport();
    const data = new Float32Array([0, 0, 1, 1]);
    layer.setData(data.buffer, data.length, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.find((c) => c.name === "beginPath")).toBeUndefined();
  });
});
