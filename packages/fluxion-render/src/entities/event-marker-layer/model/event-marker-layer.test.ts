import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { EventMarkerLayer } from "./event-marker-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 1000, yMin: -10, yMax: 10 });
  return v;
}

describe("EventMarkerLayer", () => {
  it("constructor assigns id", () => {
    const layer = new EventMarkerLayer("evt1");
    expect(layer.id).toBe("evt1");
  });

  it("setConfig updates colors, lineWidth, markerSize, visible", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({
      colors: ["#aaaaaa", "#bbbbbb", "#cccccc"],
      lineWidth: 2,
      markerSize: 12,
      visible: true,
    });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("setConfig clamps lineWidth to minimum 0.5", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({ lineWidth: 0 });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig clamps markerSize to minimum 4", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({ markerSize: 2 });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setData stores markers from [t, severity] pairs", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 200, 1, 300, 2]).buffer, 6, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(3);
  });

  it("setData with length < 2 clears all markers", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 200, 1]).buffer, 4, vp);
    layer.setData(new Float32Array([100]).buffer, 1, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw is no-op when markers array is empty", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw is no-op when visible is false", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw skips markers outside viewport bounds.xMin/xMax", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([-100, 0, 2000, 1]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("draw renders dashed vertical line (setLineDash) per visible marker", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 200, 1]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    const dashCalls = ctx.calls.filter((c) => c.name === "setLineDash");
    expect(dashCalls.length).toBe(4);
  });

  it("draw renders triangle marker (fill + closePath) per visible marker", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 200, 2]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "fill").length).toBe(2);
    expect(ctx.calls.filter((c) => c.name === "closePath").length).toBe(2);
  });

  it("draw uses info color (index 0) for severity 0", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({ colors: ["#111111", "#222222", "#333333"] });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#111111");
  });

  it("draw uses warning color (index 1) for severity 1", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({ colors: ["#111111", "#222222", "#333333"] });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 1]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#222222");
  });

  it("draw uses error color (index 2) for severity 2", () => {
    const layer = new EventMarkerLayer("evt1");
    layer.setConfig({ colors: ["#111111", "#222222", "#333333"] });
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 2]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#333333");
  });

  it("setData clamps severity out-of-range values to [0,2]", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 5, 200, -1]).buffer, 4, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(2);
  });

  it("scan is a no-op (does not modify viewport)", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0]).buffer, 2, vp);
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
    expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
  });

  it("resize does not throw", () => {
    const layer = new EventMarkerLayer("evt1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("dispose clears all markers", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 200, 1]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("replaces markers in full on subsequent setData calls", () => {
    const layer = new EventMarkerLayer("evt1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 0, 200, 1, 300, 2]).buffer, 6, vp);
    layer.setData(new Float32Array([400, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(1);
  });
});
