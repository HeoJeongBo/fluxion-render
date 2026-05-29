import { describe, expect, it } from "vitest";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { CandlestickLayer } from "./candlestick-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(800, 400, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: 0, yMax: 200 });
  return v;
}

function makeOhlc(t: number, open: number, high: number, low: number, close: number): number[] {
  return [t, open, high, low, close];
}

describe("CandlestickLayer", () => {
  it("constructor assigns id", () => {
    const layer = new CandlestickLayer("candle1");
    expect(layer.id).toBe("candle1");
  });

  it("setConfig updates upColor, downColor, bodyWidth, visible", () => {
    const layer = new CandlestickLayer("candle1");
    layer.setConfig({ upColor: "#aabbcc", downColor: "#112233", bodyWidth: 10, visible: true });
    const vp = makeViewport();
    const data = new Float32Array(makeOhlc(100, 50, 60, 40, 55));
    layer.setData(data.buffer, 5, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(true);
  });

  it("setConfig clamps bodyWidth to minimum 2", () => {
    const layer = new CandlestickLayer("candle1");
    layer.setConfig({ bodyWidth: 0 });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeOhlc(100, 50, 60, 40, 55)).buffer, 5, vp);
    const ctx = createFakeCtx();
    expect(() => layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp)).not.toThrow();
  });

  it("setConfig auto-calculates capacity from retentionMs + maxHz", () => {
    const layer = new CandlestickLayer("candle1");
    layer.setConfig({ retentionMs: 10_000, maxHz: 2 });
    const vp = makeViewport();
    const buf = new Float32Array(23 * 5);
    for (let i = 0; i < 23; i++) {
      buf[i * 5 + 0] = i * 10;
      buf[i * 5 + 1] = 50;
      buf[i * 5 + 2] = 60;
      buf[i * 5 + 3] = 40;
      buf[i * 5 + 4] = 55;
    }
    layer.setData(buf.buffer, buf.length, vp);
    layer.setData(new Float32Array(makeOhlc(300, 80, 90, 70, 85)).buffer, 5, vp);
    vp.setBounds({ xMin: 0, xMax: 10000, yMin: 0, yMax: 200 });
    vp.beginScan();
    layer.scan(vp);
    expect(vp.observedYMax).toBeCloseTo(90);
  });

  it("setData does nothing when length < 5", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    layer.setData(new Float32Array([100, 50, 60, 40]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("setData advances viewport.latestT to the last candle's t", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    const data = new Float32Array([
      ...makeOhlc(100, 50, 60, 40, 55),
      ...makeOhlc(200, 55, 65, 45, 60),
    ]);
    layer.setData(data.buffer, 10, vp);
    expect(vp.latestT).toBe(200);
  });

  it("draw is no-op when ring is empty", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("draw is no-op when visible is false", () => {
    const layer = new CandlestickLayer("candle1");
    layer.setConfig({ visible: false });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeOhlc(100, 50, 60, 40, 55)).buffer, 5, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("draw renders two fillRects per candle (wick + body)", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    const data = new Float32Array([
      ...makeOhlc(100, 50, 60, 40, 55),
      ...makeOhlc(200, 55, 65, 45, 60),
    ]);
    layer.setData(data.buffer, 10, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(4);
  });

  it("draw uses upColor when close >= open", () => {
    const layer = new CandlestickLayer("candle1");
    layer.setConfig({ upColor: "#00ff00", downColor: "#ff0000" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeOhlc(100, 50, 60, 40, 55)).buffer, 5, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.fillStyle).toBe("#00ff00");
  });

  it("draw uses downColor when close < open", () => {
    const layer = new CandlestickLayer("candle1");
    layer.setConfig({ upColor: "#00ff00", downColor: "#ff0000" });
    const vp = makeViewport();
    layer.setData(new Float32Array(makeOhlc(100, 60, 70, 40, 45)).buffer, 5, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.fillStyle).toBe("#ff0000");
  });

  it("draw filters candles older than viewport.bounds.xMin", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    const data = new Float32Array([
      ...makeOhlc(100, 50, 60, 40, 55),
      ...makeOhlc(200, 55, 65, 45, 60),
      ...makeOhlc(300, 60, 70, 50, 65),
    ]);
    layer.setData(data.buffer, 15, vp);
    vp.setBounds({ xMin: 250, xMax: 5000, yMin: 0, yMax: 200 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "fillRect").length).toBe(2);
  });

  describe("scan", () => {
    it("updates observedYMin/Max from high/low fields", () => {
      const layer = new CandlestickLayer("candle1");
      const vp = makeViewport();
      const data = new Float32Array([
        ...makeOhlc(100, 50, 80, 30, 60),
        ...makeOhlc(200, 55, 90, 20, 70),
      ]);
      layer.setData(data.buffer, 10, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(20);
      expect(vp.observedYMax).toBeCloseTo(90);
    });

    it("skips scan when visible is false", () => {
      const layer = new CandlestickLayer("candle1");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array(makeOhlc(100, 1, 200, 0, 100)).buffer, 5, vp);
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("excludes candles outside xMin", () => {
      const layer = new CandlestickLayer("candle1");
      const vp = makeViewport();
      const data = new Float32Array([
        ...makeOhlc(100, 50, 200, 10, 100),
        ...makeOhlc(500, 60, 65, 55, 62),
      ]);
      layer.setData(data.buffer, 10, vp);
      vp.setBounds({ xMin: 400, xMax: 5000, yMin: 0, yMax: 300 });
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBeCloseTo(55);
      expect(vp.observedYMax).toBeCloseTo(65);
    });

    it("leaves extents at Inf when ring is empty", () => {
      const layer = new CandlestickLayer("candle1");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  it("resize does not throw", () => {
    const layer = new CandlestickLayer("candle1");
    expect(() => layer.resize(makeViewport())).not.toThrow();
  });

  it("clearData empties the ring buffer", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    layer.setData(new Float32Array(makeOhlc(100, 50, 60, 40, 55)).buffer, 5, vp);
    layer.clearData();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });

  it("dispose clears the ring buffer", () => {
    const layer = new CandlestickLayer("candle1");
    const vp = makeViewport();
    layer.setData(new Float32Array(makeOhlc(100, 50, 60, 40, 55)).buffer, 5, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "fillRect")).toBe(false);
  });
});
