import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricsTracker } from "./metrics-tracker";

describe("MetricsTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accumulates push counters and per-layer counts", () => {
    const m = new MetricsTracker();
    m.recordPush("a", 10, 40);
    m.recordPush("a", 5, 20);
    m.recordPush("b", 3, 12);
    const snap = m.getMetrics();
    expect(snap.pushCount).toBe(3);
    expect(snap.sampleCount).toBe(18);
    expect(snap.bytesTransferred).toBe(72);
    expect(snap.pushesByLayer).toEqual({ a: 2, b: 1 });
    expect(snap.lastPushAt).not.toBeNull();
  });

  it("starts with empty metrics and null bounds", () => {
    const snap = new MetricsTracker().getMetrics();
    expect(snap.pushCount).toBe(0);
    expect(snap.pushesByLayer).toEqual({});
    expect(snap.lastPushAt).toBeNull();
    expect(snap.bounds).toBeNull();
  });

  it("reset() zeros all counters but keeps subscribers polling", () => {
    const m = new MetricsTracker();
    const cb = vi.fn();
    m.onMetricsUpdate(cb, { intervalMs: 100 });
    m.recordPush("a", 10, 40);
    m.recordBounds(-1, 2, 99);

    m.reset();
    const snap = m.getMetrics();
    expect(snap.pushCount).toBe(0);
    expect(snap.sampleCount).toBe(0);
    expect(snap.bytesTransferred).toBe(0);
    expect(snap.pushesByLayer).toEqual({});
    expect(snap.lastPushAt).toBeNull();
    expect(snap.bounds).toBeNull();

    // Subscription survives a reset — the shared interval still fires.
    vi.advanceTimersByTime(100);
    expect(cb).toHaveBeenCalledTimes(1);
    m.dispose();
  });

  it("reflects the latest recorded bounds (copied, not aliased)", () => {
    const m = new MetricsTracker();
    m.recordBounds(-1, 2, 1234);
    const snap = m.getMetrics();
    expect(snap.bounds).toEqual({ yMin: -1, yMax: 2, latestT: 1234 });
    // getMetrics returns a fresh object each call.
    expect(m.getMetrics().bounds).not.toBe(snap.bounds);
  });

  it("polls subscribers on a shared interval set by the first subscriber", () => {
    const m = new MetricsTracker();
    const a = vi.fn();
    const b = vi.fn();
    m.onMetricsUpdate(a, { intervalMs: 100 });
    // Second subscriber's intervalMs is ignored — shared interval already set.
    m.onMetricsUpdate(b, { intervalMs: 9999 });
    m.recordPush("x", 1, 4);
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0].pushCount).toBe(1);
  });

  it("defaults the interval to 250ms when unspecified", () => {
    const m = new MetricsTracker();
    const cb = vi.fn();
    m.onMetricsUpdate(cb);
    vi.advanceTimersByTime(249);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("stops the interval when the last subscriber unsubscribes", () => {
    const m = new MetricsTracker();
    const a = vi.fn();
    const b = vi.fn();
    const offA = m.onMetricsUpdate(a, { intervalMs: 50 });
    const offB = m.onMetricsUpdate(b, { intervalMs: 50 });
    vi.advanceTimersByTime(50);
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    vi.advanceTimersByTime(50);
    expect(a).toHaveBeenCalledTimes(1); // a no longer fires
    expect(b).toHaveBeenCalledTimes(2); // b still fires
    offB();
    vi.advanceTimersByTime(50);
    expect(b).toHaveBeenCalledTimes(2); // interval stopped
  });

  it("dispose stops the interval and drops subscribers", () => {
    const m = new MetricsTracker();
    const cb = vi.fn();
    m.onMetricsUpdate(cb, { intervalMs: 50 });
    m.dispose();
    vi.advanceTimersByTime(200);
    expect(cb).not.toHaveBeenCalled();
  });
});
