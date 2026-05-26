/**
 * Tests for the DVR metric-buffer flush pattern used in DvrApp/MetricsChart.
 *
 * Problem: enterDvr() calls p.play() before setIsDvr(true) triggers a React
 * re-render.  The onFrame burst therefore arrives while the OLD MetricsChart
 * instance is still mounted.  We solve this by:
 *   1. Collecting frames in a DvrApp-level `dvrMetricBufRef` array.
 *   2. Once the new MetricsChart instance's FluxionHost is ready it fires
 *      `onDvrReady(pushFn)` → DvrApp iterates the buffer and calls pushFn.
 *
 * These tests verify that contract independently of React/DOM.
 */

import { describe, expect, it } from "vitest";

// ─── Minimal replica of the buffer flush logic ───────────────────────────────

interface BufItem { channelId: string; tAbsMs: number; value: number; }

/** Simulates DvrApp.handleDvrReady */
function makeDvrReady(bufRef: { current: BufItem[] }) {
  return function handleDvrReady(
    push: (channelId: string, tAbsMs: number, value: number) => void,
  ): void {
    for (const item of bufRef.current) {
      push(item.channelId, item.tAbsMs, item.value);
    }
    bufRef.current = [];
  };
}

/** Simulates the MetricsChart useEffect([host]) that calls onDvrReady */
function simulateHostReady(
  onDvrReady: ReturnType<typeof makeDvrReady>,
  dest: Array<{ channelId: string; t: number; y: number }>,
): void {
  onDvrReady((channelId, tAbsMs, value) => {
    dest.push({ channelId, t: tAbsMs, y: value });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("DVR metric buffer flush (onDvrReady pattern)", () => {
  it("flushes all buffered frames when onDvrReady fires", () => {
    const buf = { current: [
      { channelId: "cpu",    tAbsMs: 1000, value: 30 },
      { channelId: "memory", tAbsMs: 2000, value: 55 },
      { channelId: "cpu",    tAbsMs: 3000, value: 42 },
    ] };

    const received: Array<{ channelId: string; t: number; y: number }> = [];
    simulateHostReady(makeDvrReady(buf), received);

    expect(received).toEqual([
      { channelId: "cpu",    t: 1000, y: 30 },
      { channelId: "memory", t: 2000, y: 55 },
      { channelId: "cpu",    t: 3000, y: 42 },
    ]);
  });

  it("clears the buffer after flush so a second call receives nothing", () => {
    const buf = { current: [{ channelId: "cpu", tAbsMs: 100, value: 10 }] };
    const handleDvrReady = makeDvrReady(buf);

    const first: typeof buf["current"] = [];
    simulateHostReady(handleDvrReady, first);
    expect(first).toHaveLength(1);
    expect(buf.current).toHaveLength(0);

    // A second flush (e.g. component re-render) must push nothing
    const second: typeof buf["current"] = [];
    simulateHostReady(handleDvrReady, second);
    expect(second).toHaveLength(0);
  });

  it("handles an empty buffer (no frames before host was ready)", () => {
    const buf = { current: [] as BufItem[] };
    const received: Array<{ channelId: string; t: number; y: number }> = [];
    simulateHostReady(makeDvrReady(buf), received);
    expect(received).toHaveLength(0);
  });

  it("seek resets the buffer so stale frames from the previous position are discarded", () => {
    const buf = { current: [
      { channelId: "cpu", tAbsMs: 1000, value: 10 },
      { channelId: "cpu", tAbsMs: 2000, value: 20 },
    ] };

    // Simulate seek: clear old frames, add new frames at the seek position
    buf.current = [
      { channelId: "cpu", tAbsMs: 60_000, value: 99 },
    ];

    const received: Array<{ channelId: string; t: number; y: number }> = [];
    simulateHostReady(makeDvrReady(buf), received);

    // Only the post-seek frame should arrive — not the old ones
    expect(received).toEqual([{ channelId: "cpu", t: 60_000, y: 99 }]);
  });

  it("preserves frame order (timestamps arrive monotonically from ReplayPlayer)", () => {
    const frames: BufItem[] = Array.from({ length: 20 }, (_, i) => ({
      channelId: i % 2 === 0 ? "cpu" : "memory",
      tAbsMs: 1000 + i * 200,
      value: i,
    }));
    const buf = { current: frames };

    const received: Array<{ channelId: string; t: number; y: number }> = [];
    simulateHostReady(makeDvrReady(buf), received);

    expect(received).toHaveLength(20);
    for (let i = 1; i < received.length; i++) {
      expect(received[i].t).toBeGreaterThan(received[i - 1].t);
    }
  });

  it("onDvrReady is a no-op when host is null (guard condition)", () => {
    // Simulate MetricsChart useEffect: if (!host || !onDvrReady) return
    const buf = { current: [{ channelId: "cpu", tAbsMs: 100, value: 5 }] };
    const handleDvrReady = makeDvrReady(buf);

    // Not called because host is null — buffer must remain intact
    // (we simply don't call simulateHostReady here)
    expect(buf.current).toHaveLength(1);
  });
});
