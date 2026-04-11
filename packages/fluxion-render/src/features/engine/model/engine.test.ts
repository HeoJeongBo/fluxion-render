import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Op } from "../../../shared/protocol";
import type { FakeCtx } from "../../../test/setup";
import { Engine } from "./engine";

/**
 * FakeOffscreenCanvas from test/setup.ts is installed globally, but we also
 * need to spy on the rAF loop driven by the Scheduler. We use vitest fake
 * timers to drive rAF synchronously.
 */

function newCanvas(w = 100, h = 100): OffscreenCanvas {
  // biome-ignore lint: using global stub
  return new (globalThis as any).OffscreenCanvas(w, h);
}

function flushFrame() {
  // Scheduler fallback uses setTimeout when rAF is missing; happy-dom
  // provides rAF so advancing time flushes both.
  vi.advanceTimersByTime(32);
}

describe("Engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("INIT sets canvas size and starts rendering on first frame", () => {
    const engine = new Engine();
    const canvas = newCanvas(200, 150);
    engine.dispatch({ op: Op.INIT, canvas, width: 200, height: 150, dpr: 2 });
    flushFrame();
    // dpr=2 -> canvas backbuffer = 400x300
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    const ctx = (canvas as unknown as { getContext: () => FakeCtx }).getContext();
    expect(ctx.calls.some((c) => c.name === "setTransform")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(true);
    engine.dispatch({ op: Op.DISPOSE });
  });

  it("ADD_LAYER + DATA + CONFIG (streaming line with time axis)", () => {
    const engine = new Engine();
    const canvas = newCanvas(100, 100);
    engine.dispatch({ op: Op.INIT, canvas, width: 100, height: 100, dpr: 1 });
    engine.dispatch({
      op: Op.ADD_LAYER,
      id: "axis",
      kind: "axis-grid",
      config: { xMode: "time", timeWindowMs: 1000, yRange: [-1, 1] },
    });
    engine.dispatch({
      op: Op.ADD_LAYER,
      id: "line",
      kind: "line",
      config: { color: "#0f0", capacity: 8 },
    });
    const samples = new Float32Array([0, 0, 200, 0.5, 400, -0.3, 600, 0.8]);
    engine.dispatch({
      op: Op.DATA,
      id: "line",
      buffer: samples.buffer,
      dtype: "f32",
      length: samples.length,
    });
    flushFrame();
    const ctx = (canvas as unknown as { getContext: () => FakeCtx }).getContext();
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.name === "fillText")).toBe(true);
    engine.dispatch({ op: Op.DISPOSE });
  });

  it("ADD_LAYER line-static accepts one-shot xy data", () => {
    const engine = new Engine();
    const canvas = newCanvas(100, 100);
    engine.dispatch({ op: Op.INIT, canvas, width: 100, height: 100, dpr: 1 });
    engine.dispatch({
      op: Op.ADD_LAYER,
      id: "axis",
      kind: "axis-grid",
      config: { xRange: [0, 10], yRange: [0, 10] },
    });
    engine.dispatch({
      op: Op.ADD_LAYER,
      id: "plot",
      kind: "line-static",
      config: { color: "#0ff", layout: "xy" },
    });
    const xy = new Float32Array([0, 0, 5, 5, 10, 2]);
    engine.dispatch({
      op: Op.DATA,
      id: "plot",
      buffer: xy.buffer,
      dtype: "f32",
      length: xy.length,
    });
    flushFrame();
    const ctx = (canvas as unknown as { getContext: () => FakeCtx }).getContext();
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    engine.dispatch({ op: Op.DISPOSE });
  });

  it("REMOVE_LAYER disposes and drops it from the stack", () => {
    const engine = new Engine();
    const canvas = newCanvas(100, 100);
    engine.dispatch({ op: Op.INIT, canvas, width: 100, height: 100, dpr: 1 });
    engine.dispatch({
      op: Op.ADD_LAYER,
      id: "axis",
      kind: "axis-grid",
      config: { xRange: [0, 10], yRange: [0, 10] },
    });
    flushFrame();
    const ctx = (canvas as unknown as { getContext: () => FakeCtx }).getContext();
    const before = ctx.calls.filter((c) => c.name === "fillText").length;
    expect(before).toBeGreaterThan(0);
    engine.dispatch({ op: Op.REMOVE_LAYER, id: "axis" });
    ctx.calls.length = 0;
    flushFrame();
    expect(ctx.calls.filter((c) => c.name === "fillText").length).toBe(0);
    engine.dispatch({ op: Op.DISPOSE });
  });

  it("RESIZE updates canvas backbuffer and viewport", () => {
    const engine = new Engine();
    const canvas = newCanvas(100, 100);
    engine.dispatch({ op: Op.INIT, canvas, width: 100, height: 100, dpr: 1 });
    engine.dispatch({ op: Op.RESIZE, width: 300, height: 200, dpr: 1.5 });
    expect(canvas.width).toBe(450);
    expect(canvas.height).toBe(300);
    engine.dispatch({ op: Op.DISPOSE });
  });

  it("DISPOSE stops the scheduler (no further draws)", () => {
    const engine = new Engine();
    const canvas = newCanvas(100, 100);
    engine.dispatch({ op: Op.INIT, canvas, width: 100, height: 100, dpr: 1 });
    engine.dispatch({
      op: Op.ADD_LAYER,
      id: "axis",
      kind: "axis-grid",
      config: { xRange: [0, 10], yRange: [0, 10] },
    });
    flushFrame();
    engine.dispatch({ op: Op.DISPOSE });
    const ctx = (canvas as unknown as { getContext: () => FakeCtx }).getContext();
    ctx.calls.length = 0;
    flushFrame();
    expect(ctx.calls.length).toBe(0);
  });

  it("tolerates CONFIG/DATA for unknown layer ids", () => {
    const engine = new Engine();
    const canvas = newCanvas(100, 100);
    engine.dispatch({ op: Op.INIT, canvas, width: 100, height: 100, dpr: 1 });
    expect(() =>
      engine.dispatch({
        op: Op.CONFIG,
        id: "missing",
        config: {},
      }),
    ).not.toThrow();
    const buf = new Float32Array([1, 2]);
    expect(() =>
      engine.dispatch({
        op: Op.DATA,
        id: "missing",
        buffer: buf.buffer,
        dtype: "f32",
        length: 2,
      }),
    ).not.toThrow();
    engine.dispatch({ op: Op.DISPOSE });
  });
});
