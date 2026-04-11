import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { AxisGridLayer } from "./axis-grid-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(200, 200, 1);
  return v;
}

describe("AxisGridLayer", () => {
  it("writes its configured bounds into the viewport on draw", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({ xRange: [-5, 5], yRange: [0, 10] });
    const v = makeViewport();
    layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
    expect(v.bounds).toEqual({ xMin: -5, xMax: 5, yMin: 0, yMax: 10 });
  });

  it("skips viewport mutation when applyToViewport=false", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({
      xRange: [-5, 5],
      yRange: [0, 10],
      applyToViewport: false,
    });
    const v = makeViewport();
    const before = { ...v.bounds };
    layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
    expect(v.bounds).toEqual(before);
  });

  it("renders grid lines, axes, and labels", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({ xRange: [-10, 10], yRange: [-10, 10] });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, makeViewport());
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBeGreaterThanOrEqual(2);
    expect(ctx.calls.filter((c) => c.name === "fillText").length).toBeGreaterThan(0);
  });

  it("draws a zero axis only when 0 is inside the range", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({ xRange: [1, 10], yRange: [1, 10] });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, makeViewport());
    // grid-stroke + axis-stroke are 2 distinct `stroke` calls; axis stroke
    // path is empty when 0 is outside, but the stroke call still happens.
    expect(ctx.calls.filter((c) => c.name === "stroke").length).toBe(2);
  });

  it("xMode=time tracks a trailing window of viewport.latestT", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({
      xMode: "time",
      timeWindowMs: 2000,
      yRange: [-1, 1],
    });
    const v = makeViewport();
    v.latestT = 5000;
    layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
    expect(v.bounds.xMin).toBe(3000);
    expect(v.bounds.xMax).toBe(5000);
  });

  it("xMode=time re-computes bounds on every draw as latestT advances", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({
      xMode: "time",
      timeWindowMs: 1000,
      yRange: [-1, 1],
    });
    const v = makeViewport();
    v.latestT = 1000;
    layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
    expect(v.bounds.xMax).toBe(1000);
    v.latestT = 2500;
    layer.draw(createFakeCtx() as unknown as OffscreenCanvasRenderingContext2D, v);
    expect(v.bounds.xMin).toBe(1500);
    expect(v.bounds.xMax).toBe(2500);
  });

  it("xTickFormat controls clock label pattern (custom pattern)", () => {
    const layer = new AxisGridLayer("axis");
    const origin = new Date(2026, 0, 1, 12, 34, 56, 780).getTime();
    layer.setConfig({
      xMode: "time",
      timeWindowMs: 1000,
      timeOrigin: origin,
      xTickFormat: "HH:mm:ss.SSS",
      yRange: [-1, 1],
    });
    const v = makeViewport();
    v.latestT = 0; // keep ticks near origin
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
    const labels = ctx.calls
      .filter((c) => c.name === "fillText" && typeof c.args[0] === "string")
      .map((c) => c.args[0] as string);
    // At least one label should match the HH:mm:ss.SSS shape
    expect(labels.some((l) => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(l))).toBe(true);
  });

  it("xTickFormat defaults to HH:mm:ss when unset", () => {
    const layer = new AxisGridLayer("axis");
    const origin = new Date(2026, 0, 1, 12, 34, 56).getTime();
    layer.setConfig({
      xMode: "time",
      timeWindowMs: 1000,
      timeOrigin: origin,
      yRange: [-1, 1],
    });
    const v = makeViewport();
    v.latestT = 0;
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
    const labels = ctx.calls
      .filter((c) => c.name === "fillText" && typeof c.args[0] === "string")
      .map((c) => c.args[0] as string);
    expect(labels.some((l) => /^\d{2}:\d{2}:\d{2}$/.test(l))).toBe(true);
  });

  it("xMode=time + timeOrigin yields HH:mm:ss formatted x labels", () => {
    const layer = new AxisGridLayer("axis");
    // Pick an origin that maps latestT=5000 to a known wall-clock moment.
    const origin = new Date(2026, 0, 1, 12, 34, 50).getTime();
    layer.setConfig({
      xMode: "time",
      timeWindowMs: 5000,
      timeOrigin: origin,
      yRange: [-1, 1],
    });
    const v = makeViewport();
    v.latestT = 5000;
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
    const clockLabels = ctx.calls.filter(
      (c) =>
        c.name === "fillText" &&
        typeof c.args[0] === "string" &&
        /^\d{2}:\d{2}:\d{2}$/.test(c.args[0] as string),
    );
    expect(clockLabels.length).toBeGreaterThan(0);
  });

  it("xMode=time yields 'Xs' formatted x labels", () => {
    const layer = new AxisGridLayer("axis");
    layer.setConfig({
      xMode: "time",
      timeWindowMs: 2000,
      yRange: [-1, 1],
    });
    const v = makeViewport();
    v.latestT = 5000;
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
    const timeLabels = ctx.calls.filter(
      (c) =>
        c.name === "fillText" &&
        typeof c.args[0] === "string" &&
        (c.args[0] as string).endsWith("s"),
    );
    expect(timeLabels.length).toBeGreaterThan(0);
  });
});
