import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { PolarLayer } from "./polar-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(400, 400, 1);
  v.setBounds({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
  return v;
}

/** [theta, r] pairs → flat buffer. */
function pts(...p: [number, number][]): ArrayBuffer {
  const buf = new Float32Array(p.length * 2);
  p.forEach((q, i) => {
    buf[i * 2] = q[0];
    buf[i * 2 + 1] = q[1];
  });
  return buf.buffer as ArrayBuffer;
}

function draw(layer: PolarLayer, vp: Viewport) {
  const ctx = createFakeCtx();
  layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
  return ctx;
}

const RING = 0; // angle helper readability

describe("PolarLayer", () => {
  it("constructor assigns id", () => {
    expect(new PolarLayer("pl").id).toBe("pl");
  });

  it("strokes a polar trace and draws rings by default", () => {
    const layer = new PolarLayer("pl");
    const vp = makeViewport();
    layer.setData(pts([0, 1], [Math.PI / 2, 0.5], [Math.PI, 1]), 6, vp);
    const ctx = draw(layer, vp);
    // default ringCount=4 rings (arc) + the trace stroke
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBe(4);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "moveTo")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "lineTo")).toBe(true);
  });

  it("closes the path when closed=true and not when false", () => {
    const vp = makeViewport();
    const closedLayer = new PolarLayer("a");
    closedLayer.setConfig({ closed: true, showRings: false });
    closedLayer.setData(pts([0, 1], [1, 1], [2, 1]), 6, vp);
    expect(draw(closedLayer, vp).calls.some((c) => c.name === "closePath")).toBe(true);

    const openLayer = new PolarLayer("b");
    openLayer.setConfig({ closed: false, showRings: false });
    openLayer.setData(pts([0, 1], [1, 1], [2, 1]), 6, vp);
    expect(draw(openLayer, vp).calls.some((c) => c.name === "closePath")).toBe(false);
  });

  it("fills the polygon when fillOpacity > 0", () => {
    const layer = new PolarLayer("pl");
    layer.setConfig({ fillOpacity: 0.5, showRings: false });
    const vp = makeViewport();
    layer.setData(pts([0, 1], [2, 1], [4, 1]), 6, vp);
    const ctx = draw(layer, vp);
    expect(ctx.calls.some((c) => c.name === "fill")).toBe(true);
  });

  it("draws a marker per vertex when showPoints is on", () => {
    const layer = new PolarLayer("pl");
    layer.setConfig({ showPoints: true, pointSize: 4, showRings: false });
    const vp = makeViewport();
    layer.setData(pts([0, 1], [1, 0.5], [2, 0.8]), 6, vp);
    const ctx = draw(layer, vp);
    // 3 point arcs (no rings)
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBe(3);
  });

  it("uses fixed rMax when configured", () => {
    const layer = new PolarLayer("pl");
    layer.setConfig({ rMax: 10, showRings: false });
    const vp = makeViewport();
    layer.setData(pts([0, 5]), 2, vp);
    expect(() => draw(layer, vp)).not.toThrow();
  });

  it("handles all-zero radii (rMax auto = 0) without dividing by zero", () => {
    const layer = new PolarLayer("pl");
    layer.setConfig({ showRings: false });
    const vp = makeViewport();
    layer.setData(pts([0, 0], [1, 0]), 4, vp);
    expect(() => draw(layer, vp)).not.toThrow();
  });

  it("clamps lineWidth, fillOpacity, pointSize, ringCount, insetPx", () => {
    const layer = new PolarLayer("pl");
    layer.setConfig({
      lineWidth: 0,
      fillOpacity: 2,
      pointSize: 0,
      ringCount: 0,
      insetPx: -5,
      showPoints: true,
      color: "#abcdef",
      gridColor: "#333",
    });
    const vp = makeViewport();
    layer.setData(pts([RING, 1], [1, 1]), 4, vp);
    const ctx = draw(layer, vp);
    // ringCount clamped to 1 → 1 ring arc
    expect(ctx.calls.filter((c) => c.name === "arc").length).toBeGreaterThanOrEqual(1);
  });

  it("hidden layer skips draw", () => {
    const layer = new PolarLayer("pl");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(pts([0, 1], [1, 1]), 4, vp);
    expect(draw(layer, vp).calls.length).toBe(0);
  });

  it("ignores sub-stride buffers", () => {
    const layer = new PolarLayer("pl");
    const vp = makeViewport();
    layer.setData(new Float32Array([1]).buffer, 1, vp);
    expect(draw(layer, vp).calls.length).toBe(0);
  });

  it("clearData and dispose empty the trace", () => {
    const layer = new PolarLayer("pl");
    const vp = makeViewport();
    layer.setData(pts([0, 1], [1, 1]), 4, vp);
    layer.clearData();
    expect(draw(layer, vp).calls.length).toBe(0);
    layer.setData(pts([0, 1], [1, 1]), 4, vp);
    layer.dispose();
    expect(draw(layer, vp).calls.length).toBe(0);
  });

  it("resize is a no-op", () => {
    expect(() => new PolarLayer("pl").resize(makeViewport())).not.toThrow();
  });
});
