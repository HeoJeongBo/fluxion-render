import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { TrajectoryLayer } from "./trajectory-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
  return v;
}

/** [x, y, t] triples → flat Float32Array (typed ArrayBuffer for setData). */
function path(...pts: [number, number, number][]): ArrayBuffer {
  const buf = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {
    buf[i * 3] = p[0];
    buf[i * 3 + 1] = p[1];
    buf[i * 3 + 2] = p[2];
  });
  return buf.buffer as ArrayBuffer;
}

function draw(layer: TrajectoryLayer, vp: Viewport) {
  const ctx = createFakeCtx();
  layer.scan(vp);
  layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
  return ctx;
}

describe("TrajectoryLayer", () => {
  it("constructor assigns id", () => {
    expect(new TrajectoryLayer("tj").id).toBe("tj");
  });

  it("draws a polyline through the points (fast path)", () => {
    const layer = new TrajectoryLayer("tj");
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100], [2, 2, 200]), 9, vp);
    const ctx = draw(layer, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    // head marker by default
    expect(ctx.calls.some((c) => c.name === "arc")).toBe(true);
  });

  it("scan writes the observed y extent from world coords", () => {
    const layer = new TrajectoryLayer("tj");
    const vp = makeViewport();
    layer.setData(path([0, -3, 0], [1, 7, 100]), 6, vp);
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMin).toBeLessThanOrEqual(-3);
    expect(vp.observedYMax).toBeGreaterThanOrEqual(7);
  });

  it("setData advances viewport.latestT to the newest t", () => {
    const layer = new TrajectoryLayer("tj");
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 500]), 6, vp);
    expect(vp.latestT).toBe(500);
  });

  it("colorByTime strokes each segment with a LUT color", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ colorByTime: true, colormap: "plasma", headMarker: false });
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100], [2, 0, 200]), 9, vp);
    const ctx = draw(layer, vp);
    // one stroke per segment (2 segments for 3 points), no head marker
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(2);
    expect(ctx.calls.some((c) => c.name === "arc")).toBe(false);
  });

  it("fadeOlderMs strokes the solid path per segment", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ fadeOlderMs: 100, headMarker: false });
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100], [2, 2, 150]), 9, vp);
    const ctx = draw(layer, vp);
    // 2 segments → 2 strokes (per-segment alpha)
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(2);
  });

  it("fadeOlderMs also applies under colorByTime", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ colorByTime: true, fadeOlderMs: 100, headMarker: false });
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100], [2, 0, 200]), 9, vp);
    const ctx = draw(layer, vp);
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(2);
  });

  it("honours all colormaps and solid color / lineWidth / marker size", () => {
    for (const colormap of ["viridis", "plasma", "hot"] as const) {
      const layer = new TrajectoryLayer(`tj-${colormap}`);
      layer.setConfig({ colorByTime: true, colormap });
      const vp = makeViewport();
      layer.setData(path([0, 0, 0], [1, 1, 100]), 6, vp);
      expect(() => draw(layer, vp)).not.toThrow();
    }
    const solid = new TrajectoryLayer("solid");
    solid.setConfig({ color: "#ff0000", lineWidth: 3, headMarkerSize: 8 });
    const vp = makeViewport();
    solid.setData(path([0, 0, 0], [1, 1, 100]), 6, vp);
    expect(() => draw(solid, vp)).not.toThrow();
  });

  it("clamps headMarkerSize and fadeOlderMs to their minimums", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ headMarkerSize: 0, fadeOlderMs: -5 });
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100]), 6, vp);
    // fadeOlderMs clamped to 0 → solid fast path, headMarkerSize clamped to >=1
    const ctx = draw(layer, vp);
    const arc = ctx.calls.find((c) => c.name === "arc");
    expect(arc).toBeTruthy();
    expect(arc!.args[2]).toBeGreaterThanOrEqual(1);
  });

  it("auto-sizes capacity from retentionMs + maxHz", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ retentionMs: 1000, maxHz: 100 }); // ceil(1 * 100 * 1.1) = 110
    const vp = makeViewport();
    // push 200 points; only the last 110 should survive → no throw, draws
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 200; i++) pts.push([i, i % 5, i * 10]);
    layer.setData(path(...pts), 600, vp);
    expect(() => draw(layer, vp)).not.toThrow();
  });

  it("explicit capacity overrides and resizes the ring", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(path([0, 0, 0]), 3, vp);
    expect(() => draw(layer, vp)).not.toThrow();
  });

  it("hidden layer skips scan and draw", () => {
    const layer = new TrajectoryLayer("tj");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100]), 6, vp);
    vp.beginScan();
    const before = vp.observedYMax;
    layer.scan(vp);
    expect(vp.observedYMax).toBe(before);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("empty ring is a no-op for scan and draw", () => {
    const layer = new TrajectoryLayer("tj");
    const vp = makeViewport();
    vp.beginScan();
    layer.scan(vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("setData ignores sub-stride buffers", () => {
    const layer = new TrajectoryLayer("tj");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0]).buffer, 2, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("clearData and dispose empty the ring", () => {
    const layer = new TrajectoryLayer("tj");
    const vp = makeViewport();
    layer.setData(path([0, 0, 0], [1, 1, 100]), 6, vp);
    layer.clearData();
    let ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
    layer.setData(path([0, 0, 0]), 3, vp);
    layer.dispose();
    ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.length).toBe(0);
  });

  it("resize is a no-op", () => {
    const layer = new TrajectoryLayer("tj");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });
});
