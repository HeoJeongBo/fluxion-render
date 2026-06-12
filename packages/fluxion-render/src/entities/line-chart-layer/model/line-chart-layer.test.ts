import { describe, expect, it } from "vitest";
import { AxisGridLayer } from "../../axis-grid-layer/model/axis-grid-layer";
import { Viewport } from "../../../shared/model/viewport";
import { createFakeCtx } from "../../../test/setup";
import { LineChartLayer } from "./line-chart-layer";

function makeViewport() {
  const v = new Viewport();
  v.setSize(1000, 100, 1);
  v.setBounds({ xMin: 0, xMax: 5000, yMin: -1, yMax: 1 });
  return v;
}

describe("LineChartLayer (streaming)", () => {
  it("no-op when fewer than 2 samples have been pushed", () => {
    const layer = new LineChartLayer("l");
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, makeViewport());
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  it("accumulates [t,y] samples across multiple setData calls", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 8 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 0.5]).buffer, 4, vp);
    layer.setData(new Float32Array([200, -0.5, 300, 0.8]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // 4 samples -> 1 moveTo + 3 lineTos
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(3);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
  });

  it("advances viewport.latestT to the newest timestamp", () => {
    const layer = new LineChartLayer("l");
    const vp = makeViewport();
    expect(vp.latestT).toBe(0);
    layer.setData(new Float32Array([100, 0.1, 250, 0.2, 900, 0.3]).buffer, 6, vp);
    expect(vp.latestT).toBe(900);
    // An earlier batch must not roll latestT backwards
    layer.setData(new Float32Array([50, 0.0]).buffer, 2, vp);
    expect(vp.latestT).toBe(900);
  });

  it("overflow keeps most recent samples (ring buffer)", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 3 });
    const vp = makeViewport();
    layer.setData(
      new Float32Array([0, 0, 100, 1, 200, 2, 300, 3, 400, 4]).buffer,
      10,
      vp,
    );
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // capacity 3 -> 1 moveTo + 2 lineTos
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
  });

  it("respects color + lineWidth config", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ color: "#ff00aa", lineWidth: 3 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 0.5]).buffer, 4, vp);
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.strokeStyle).toBe("#ff00aa");
    expect(ctx.lineWidth).toBe(3);
  });

  it("draw filters samples older than viewport.bounds.xMin", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    // Push 5 samples at t = 0, 100, 200, 300, 400
    layer.setData(
      new Float32Array([0, 0, 100, 0.1, 200, 0.2, 300, 0.3, 400, 0.4]).buffer,
      10,
      vp,
    );
    // Retarget the viewport to the trailing 200ms window
    vp.setBounds({ xMin: 200, xMax: 400, yMin: -1, yMax: 1 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    // Only samples at t = 200, 300, 400 remain visible -> 1 moveTo + 2 lineTo
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
  });

  it("draw skips stroke entirely when every sample is outside the window", () => {
    const layer = new LineChartLayer("l");
    layer.setConfig({ capacity: 16 });
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 1, 200, 2]).buffer, 6, vp);
    // Window starts in the future — nothing visible
    vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -1, yMax: 1 });
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(0);
    expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(0);
  });

  describe("scan (y auto-fit support)", () => {
    it("publishes visible-window min/max to viewport.observedYMin/Max", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 16 });
      const vp = makeViewport();
      vp.setBounds({ xMin: 0, xMax: 5000, yMin: -10, yMax: 10 });
      layer.setData(
        new Float32Array([100, 0.1, 200, -0.5, 300, 1.2, 400, 0.3]).buffer,
        8,
        vp,
      );
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBeCloseTo(-0.5);
      expect(vp.observedYMax).toBeCloseTo(1.2);
    });

    it("excludes samples outside the current x window", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 16 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 100, 100, 50, 200, -20, 300, 5]).buffer, 8, vp);
      // Only samples with t >= 150 should contribute
      vp.setBounds({ xMin: 150, xMax: 500, yMin: -100, yMax: 100 });
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBeCloseTo(-20);
      expect(vp.observedYMax).toBeCloseTo(5);
    });

    it("leaves observed extents at +/-Inf when ring is empty", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("leaves observed extents untouched when every sample is outside the window", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 8 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1, 200, 2]).buffer, 6, vp);
      vp.setBounds({ xMin: 5000, xMax: 6000, yMin: -1, yMax: 1 });
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("two layers merge their observations into a single aggregate", () => {
      const a = new LineChartLayer("a");
      const b = new LineChartLayer("b");
      const vp = makeViewport();
      vp.setBounds({ xMin: 0, xMax: 1000, yMin: -100, yMax: 100 });
      a.setData(new Float32Array([100, 1, 200, 2, 300, 3]).buffer, 6, vp);
      b.setData(new Float32Array([150, -5, 250, 10, 350, 0]).buffer, 6, vp);
      vp.beginScan();
      a.scan?.(vp);
      b.scan?.(vp);
      expect(vp.observedYMin).toBeCloseTo(-5);
      expect(vp.observedYMax).toBeCloseTo(10);
    });
  });

  describe("capacity via retentionMs + maxHz", () => {
    it("auto-calculates capacity from retentionMs and maxHz", () => {
      const layer = new LineChartLayer("l");
      // ceil(10 * 60 * 1.1) = 660
      layer.setConfig({ retentionMs: 10_000, maxHz: 60 });
      const vp = makeViewport();
      // Fill 660 samples then push 1 more — oldest should be dropped (ring wraps)
      const buf = new Float32Array(660 * 2);
      for (let i = 0; i < 660; i++) { buf[i * 2] = i; buf[i * 2 + 1] = 0; }
      layer.setData(buf.buffer, buf.length, vp);
      const extra = new Float32Array([700, 9]);
      layer.setData(extra.buffer, 2, vp);
      vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
      vp.beginScan();
      layer.scan?.(vp);
      // y=9 should be visible; y=0 from very first sample is dropped
      expect(vp.observedYMax).toBeCloseTo(9);
    });

    it("explicit capacity takes priority over retentionMs+maxHz", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 500, retentionMs: 10_000, maxHz: 60 });
      const vp = makeViewport();
      // Fill 500 + 1 samples — ring wraps at 500, not 660
      const buf = new Float32Array(500 * 2);
      for (let i = 0; i < 500; i++) { buf[i * 2] = i; buf[i * 2 + 1] = 1; }
      layer.setData(buf.buffer, buf.length, vp);
      layer.setData(new Float32Array([600, 5]).buffer, 2, vp);
      vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMax).toBeCloseTo(5);
    });

    it("retentionMs alone without maxHz leaves capacity unchanged", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 100 });
      layer.setConfig({ retentionMs: 10_000 }); // no maxHz → no-op
      const vp = makeViewport();
      // Fill 100 samples + 1 overflow — ring capacity should still be 100
      const buf = new Float32Array(100 * 2);
      for (let i = 0; i < 100; i++) { buf[i * 2] = i; buf[i * 2 + 1] = 0; }
      layer.setData(buf.buffer, buf.length, vp);
      layer.setData(new Float32Array([200, 7]).buffer, 2, vp);
      vp.setBounds({ xMin: 0, xMax: 10000, yMin: -1, yMax: 10 });
      vp.beginScan();
      layer.scan?.(vp);
      // capacity=100 so first sample was dropped and y=7 is present
      expect(vp.observedYMax).toBeCloseTo(7);
    });
  });

  describe("visible flag", () => {
    it("visible: false skips draw", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
    });

    it("visible: false skips scan (y extents untouched)", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ visible: false });
      const vp = makeViewport();
      vp.setBounds({ xMin: 0, xMax: 1000, yMin: -100, yMax: 100 });
      layer.setData(new Float32Array([0, 99, 100, -99]).buffer, 4, vp);
      vp.beginScan();
      layer.scan?.(vp);
      expect(vp.observedYMin).toBe(Number.POSITIVE_INFINITY);
      expect(vp.observedYMax).toBe(Number.NEGATIVE_INFINITY);
    });

    it("toggling visible back to true resumes draw", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
      layer.setConfig({ visible: false });
      layer.setConfig({ visible: true });
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    });
  });

  it("dispose clears the ring buffer", () => {
    const layer = new LineChartLayer("l");
    const vp = makeViewport();
    layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
    layer.dispose();
    const ctx = createFakeCtx();
    layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
    expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
  });

  describe("clearData (replay seek support)", () => {
    it("drops every sample from the ring buffer", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1, 200, 2]).buffer, 6, vp);
      layer.clearData();
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(false);
    });

    it("preserves config so subsequent pushes use the same capacity", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 3, color: "#abc" });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 1]).buffer, 4, vp);
      layer.clearData();
      // Push 5 samples; the configured capacity of 3 must still cap the ring.
      layer.setData(
        new Float32Array([200, 2, 300, 3, 400, 4, 500, 5, 600, 6]).buffer,
        10,
        vp,
      );
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // 3 visible samples -> 1 moveTo + 2 lineTos
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
      expect(ctx.strokeStyle).toBe("#abc");
    });
  });

  // Phase 17 — Bug 2 e2e: when a DVR hydrate does
  // `clearData(latestT = seekT)` then `setData(samples in [seekT - windowMs, seekT])`,
  // the line + axis combination MUST render those samples (not "start fresh").
  // This is the worker-side equivalent of `useChartReplay.hydrate`. The user
  // reported the chart looked empty after going to past; this test pins down
  // the exact pipeline so that bug can't silently regress.
  describe("DVR hydrate integration (line + axis)", () => {
    it("clearData(seekT) + setData([seekT-windowMs, seekT]) renders all backfill samples", () => {
      const SEEK_T = 10_000; // host-relative ms
      const WINDOW_MS = 5_000;

      const axis = new AxisGridLayer("axis");
      axis.setConfig({
        xMode: "time",
        timeWindowMs: WINDOW_MS,
        yMode: "auto",
        applyToViewport: true,
      });
      const line = new LineChartLayer("line");
      line.setConfig({ capacity: 200 });

      const v = new Viewport();
      v.setSize(1000, 100, 1);

      // The hydrate flow: reset wipes the ring AND rewinds latestT, then
      // setData pushes the backfill samples (each t <= SEEK_T).
      line.clearData();
      v.latestT = SEEK_T; // CLEAR_DATA op also sets viewport.latestT

      // 100 samples at 50 ms intervals covering [5000, 9950].
      const buf = new Float32Array(200);
      for (let i = 0; i < 100; i++) {
        const t = SEEK_T - WINDOW_MS + i * 50;
        buf[i * 2] = t;
        buf[i * 2 + 1] = i / 10;
      }
      line.setData(buf.buffer, buf.length, v);

      // The axis scan computes the visible window from viewport.latestT.
      v.beginScan();
      axis.scan?.(v);
      // The line scan filters by xMin (= latestT - windowMs).
      line.scan?.(v);

      // The axis must have anchored the visible range at [SEEK_T - WINDOW_MS, SEEK_T].
      expect(v.bounds.xMin).toBe(SEEK_T - WINDOW_MS);
      expect(v.bounds.xMax).toBe(SEEK_T);

      // The line must actually draw — 100 samples in range → 1 moveTo + 99 lineTos.
      const ctx = createFakeCtx();
      line.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
      const moves = ctx.calls.filter((c) => c.name === "moveTo").length;
      const lines = ctx.calls.filter((c) => c.name === "lineTo").length;
      expect(moves).toBe(1);
      expect(lines).toBe(99);
      expect(ctx.calls.some((c) => c.name === "stroke")).toBe(true);
    });

    it("the boundary sample at t === seekT is NOT silently dropped", () => {
      // Specifically guards against an off-by-one in xMax / latestT logic
      // that would clip the most recent backfill point.
      const SEEK_T = 20_000;
      const WINDOW_MS = 5_000;

      const axis = new AxisGridLayer("axis");
      axis.setConfig({
        xMode: "time",
        timeWindowMs: WINDOW_MS,
        applyToViewport: true,
      });
      const line = new LineChartLayer("line");
      line.setConfig({ capacity: 16 });
      const v = new Viewport();
      v.setSize(500, 100, 1);

      line.clearData();
      v.latestT = SEEK_T;
      // Two samples, the second exactly at SEEK_T.
      line.setData(
        new Float32Array([SEEK_T - 1_000, 0.1, SEEK_T, 0.2]).buffer,
        4,
        v,
      );

      v.beginScan();
      axis.scan?.(v);
      line.scan?.(v);
      const ctx = createFakeCtx();
      line.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);

      // Two samples → 1 moveTo + 1 lineTo. If the boundary sample were
      // dropped we'd get 0 lineTos.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(1);
    });
  });

  // Regression for the DVR→Live "all charts blank" bug. `viewport.latestT` is
  // GLOBAL — shared by every layer of a host. The live backfill clears a
  // layer's ring with `reset()` (CLEAR_DATA with NO latestT) precisely so it
  // does NOT rewind the shared latestT and yank every sibling layer's time
  // window. These tests pin that contract: clearing layer A must not blank
  // sibling layer B; rewinding latestT (the old buggy path) does.
  describe("shared-host multi-layer: clearing one layer must not blank siblings", () => {
    const WINDOW_MS = 30_000;

    function makeAxisAndViewport() {
      const axis = new AxisGridLayer("axis");
      axis.setConfig({
        xMode: "time",
        timeWindowMs: WINDOW_MS,
        yMode: "auto",
        applyToViewport: true,
      });
      const v = new Viewport();
      v.setSize(1000, 100, 1);
      return { axis, v };
    }

    // Fill a layer with `count` samples ending exactly at `endT` (50 ms apart),
    // advancing the shared latestT to `endT` via setData (monotonic-up).
    function fill(layer: LineChartLayer, endT: number, count: number, v: Viewport) {
      const buf = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        buf[i * 2] = endT - (count - 1 - i) * 50;
        buf[i * 2 + 1] = i / 10;
      }
      layer.setData(buf.buffer, buf.length, v);
    }

    // A line is actually visible only if a path was built — `draw` always calls
    // stroke(), even with no in-window samples, so count moveTo instead.
    function drawsLine(layer: LineChartLayer, v: Viewport): boolean {
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, v);
      return ctx.calls.some((c) => c.name === "moveTo");
    }

    it("reset() without latestT on layer A leaves sibling B drawing", () => {
      const NOW = 200_000;
      const { axis, v } = makeAxisAndViewport();
      const a = new LineChartLayer("a");
      const b = new LineChartLayer("b");
      a.setConfig({ capacity: 1024 });
      b.setConfig({ capacity: 1024 });

      // Both layers hold a recent window; latestT advances to NOW.
      fill(a, NOW, 100, v);
      fill(b, NOW, 100, v);
      v.beginScan();
      axis.scan?.(v);
      expect(v.bounds.xMin).toBe(NOW - WINDOW_MS);
      expect(v.bounds.xMax).toBe(NOW);
      expect(drawsLine(a, v)).toBe(true);
      expect(drawsLine(b, v)).toBe(true);

      // Live backfill for A: ring-only clear (NO latestT rewind), then refill.
      a.clearData(); // CLEAR_DATA with latestT undefined → latestT untouched
      // B is untouched. Its samples must still be in-window — the window did
      // not move because clearData() left latestT alone.
      fill(a, NOW, 100, v); // A's fresh window lands, latestT stays NOW

      v.beginScan();
      axis.scan?.(v);
      expect(v.bounds.xMin).toBe(NOW - WINDOW_MS); // window unchanged
      expect(v.bounds.xMax).toBe(NOW);
      // The whole point: B never blanked.
      expect(drawsLine(b, v)).toBe(true);
      expect(drawsLine(a, v)).toBe(true);
    });

    it("CONTRAST: rewinding latestT forward (the old buggy path) DOES blank sibling B", () => {
      // Demonstrates the failure mode the no-latestT reset avoids: if A's clear
      // had forced latestT far forward while B still held only older samples,
      // B's data falls outside [latestT - windowMs, latestT] and B blanks.
      const PAST = 100_000;
      const { axis, v } = makeAxisAndViewport();
      const a = new LineChartLayer("a");
      const b = new LineChartLayer("b");
      a.setConfig({ capacity: 1024 });
      b.setConfig({ capacity: 1024 });

      fill(a, PAST, 100, v);
      fill(b, PAST, 100, v);
      v.beginScan();
      axis.scan?.(v);
      expect(drawsLine(b, v)).toBe(true);

      // Simulate the buggy forward rewind: clear A AND jam latestT to a much
      // later "now" (as `reset(now - timeOrigin)` did). B's window-relative
      // data is now far in the past → outside the window → B draws nothing.
      const FUTURE = PAST + WINDOW_MS * 4;
      a.clearData();
      v.latestT = FUTURE; // the destructive global rewind

      v.beginScan();
      axis.scan?.(v);
      expect(v.bounds.xMin).toBe(FUTURE - WINDOW_MS);
      expect(drawsLine(b, v)).toBe(false); // ← the all-charts-blank symptom
    });
  });

  describe("draw decimation (decimate: true)", () => {
    // Viewport is 1000px wide over [0, 5000]. 5000 samples → 5 per pixel.
    function fill5000(layer: LineChartLayer, vp: Viewport, spikeAt?: number) {
      layer.setConfig({ capacity: 6000 });
      const buf = new Float32Array(5000 * 2);
      for (let i = 0; i < 5000; i++) {
        buf[i * 2] = i; // t = 0..4999 (1px ≈ 5 samples)
        // Mostly ~0, with one big spike if requested.
        buf[i * 2 + 1] = i === spikeAt ? 0.9 : Math.sin(i * 0.01) * 0.05;
      }
      layer.setData(buf.buffer, buf.length, vp);
    }

    it("emits far fewer path points than samples (≈ O(width), not O(samples))", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setConfig({ decimate: true });
      fill5000(layer, vp);

      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      const points =
        ctx.calls.filter((c) => c.name === "moveTo").length +
        ctx.calls.filter((c) => c.name === "lineTo").length;
      // 5000 samples → bounded to ~a few per 1000px column, well under 5000.
      expect(points).toBeGreaterThan(0);
      expect(points).toBeLessThan(5000);
      expect(points).toBeLessThanOrEqual(1000 * 4); // ≤ ~4 points/pixel
    });

    it("preserves a spike's peak in the decimated path (visually lossless)", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setConfig({ decimate: true });
      fill5000(layer, vp, 2500); // spike of y=0.9 at t=2500

      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // The spike's y (0.9) maps to a px via yToPx; it must appear among the
      // drawn points (the min/max bucket keeps the column's extreme).
      const spikePy = vp.yToPx(0.9);
      const ys = ctx.calls
        .filter((c) => c.name === "moveTo" || c.name === "lineTo")
        .map((c) => (c.args as number[])[1]);
      expect(ys.some((y) => Math.abs(y - spikePy) < 0.5)).toBe(true);
    });

    it("decimate does NOT change the ring — scan still sees full-resolution y extremes", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setConfig({ decimate: true });
      fill5000(layer, vp, 2500); // spike 0.9
      vp.setBounds({ xMin: 0, xMax: 5000, yMin: -1, yMax: 1 });
      vp.beginScan();
      layer.scan?.(vp);
      // The full-resolution spike is still observed for y-auto bounds.
      expect(vp.observedYMax).toBeCloseTo(0.9, 5);
    });

    it("decimate: false (default) draws every sample", () => {
      const layer = new LineChartLayer("l");
      const vp = makeViewport();
      layer.setConfig({ capacity: 6000 }); // decimate stays false
      const buf = new Float32Array(3000 * 2);
      for (let i = 0; i < 3000; i++) {
        buf[i * 2] = i;
        buf[i * 2 + 1] = 0;
      }
      layer.setData(buf.buffer, buf.length, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      const lineTos = ctx.calls.filter((c) => c.name === "lineTo").length;
      expect(lineTos).toBe(2999); // 1 moveTo + 2999 lineTo = every sample
    });
  });

  describe("maxGapMs gap-breaking", () => {
    it("breaks the stroke at gaps larger than maxGapMs (extra moveTo, fewer lineTo)", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 8, maxGapMs: 150 });
      const vp = makeViewport();
      // Two bursts separated by an 800 ms silence.
      layer.setData(
        new Float32Array([0, 0, 100, 0.5, 200, 0.2, 1000, -0.3, 1100, 0.1]).buffer,
        10,
        vp,
      );
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // One subpath per burst: 2 moveTo; the gap edge is NOT bridged.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(2);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(3);
    });

    it("no maxGapMs leaves the path fully connected (unchanged behavior)", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 8 });
      const vp = makeViewport();
      layer.setData(
        new Float32Array([0, 0, 100, 0.5, 200, 0.2, 1000, -0.3, 1100, 0.1]).buffer,
        10,
        vp,
      );
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(4);
    });

    it("a gap exactly equal to maxGapMs does NOT break (strict >)", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 8, maxGapMs: 100 });
      const vp = makeViewport();
      layer.setData(new Float32Array([0, 0, 100, 0.5, 200, 0.2]).buffer, 6, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(1);
      expect(ctx.calls.filter((c) => c.name === "lineTo").length).toBe(2);
    });

    it("decimated path breaks at gaps (one moveTo per segment)", () => {
      const layer = new LineChartLayer("l");
      layer.setConfig({ capacity: 8192, decimate: true, maxGapMs: 50 });
      const vp = new Viewport();
      vp.setSize(1000, 100, 1);
      vp.setBounds({ xMin: 0, xMax: 7000, yMin: -1, yMax: 1 });
      // Two dense bursts (1 ms apart, no internal gaps) separated by 1001 ms.
      const samples = new Float32Array(6000 * 2);
      for (let i = 0; i < 3000; i++) {
        samples[i * 2] = i;
        samples[i * 2 + 1] = Math.sin(i / 50);
      }
      for (let i = 0; i < 3000; i++) {
        samples[(3000 + i) * 2] = 4000 + i;
        samples[(3000 + i) * 2 + 1] = Math.sin(i / 50);
      }
      layer.setData(samples.buffer, samples.length, vp);
      const ctx = createFakeCtx();
      layer.draw(ctx as unknown as OffscreenCanvasRenderingContext2D, vp);
      // Decimation active (6000 samples > 1000 px * 2) with exactly one
      // subpath per burst.
      expect(ctx.calls.filter((c) => c.name === "moveTo").length).toBe(2);
      const lineTos = ctx.calls.filter((c) => c.name === "lineTo").length;
      expect(lineTos).toBeGreaterThan(0);
      expect(lineTos).toBeLessThan(6000); // decimated, not per-sample
    });
  });
});
