import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scheduler } from "./scheduler";

describe("Scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("only ticks when marked dirty", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    // advance several frames — no ticks yet
    vi.advanceTimersByTime(100);
    expect(tick).not.toHaveBeenCalled();

    s.markDirty();
    vi.advanceTimersByTime(20);
    expect(tick).toHaveBeenCalledTimes(1);

    // dirty is consumed after tick
    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(1);

    s.stop();
  });

  it("coalesces multiple markDirty into a single tick per frame", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.markDirty();
    s.markDirty();
    s.markDirty();
    vi.advanceTimersByTime(20);
    expect(tick).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("stop prevents further ticks", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.stop();
    s.markDirty();
    vi.advanceTimersByTime(100);
    expect(tick).not.toHaveBeenCalled();
  });

  it("start is idempotent", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.start();
    s.markDirty();
    vi.advanceTimersByTime(20);
    expect(tick).toHaveBeenCalledTimes(1);
    s.stop();
  });

  it("continuous mode ticks every frame without markDirty", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.setContinuous(true);
    vi.advanceTimersByTime(20);
    expect(tick).toHaveBeenCalledTimes(1);
    // Keeps firing on subsequent frames with no markDirty.
    vi.advanceTimersByTime(40);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(2);
    s.stop();
  });

  it("setContinuous(false) returns to dirty-gated behavior", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.setContinuous(true);
    vi.advanceTimersByTime(40);
    const afterContinuous = tick.mock.calls.length;
    expect(afterContinuous).toBeGreaterThanOrEqual(1);

    s.setContinuous(false);
    // Drain the pending dirty frame, if any.
    vi.advanceTimersByTime(20);
    const baseline = tick.mock.calls.length;
    // No further ticks without markDirty.
    vi.advanceTimersByTime(100);
    expect(tick.mock.calls.length).toBe(baseline);
    s.stop();
  });

  it("continuous mode respects stop()", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.setContinuous(true);
    s.stop();
    vi.advanceTimersByTime(100);
    expect(tick).not.toHaveBeenCalled();
  });

  it("uses setTimeout fallback when requestAnimationFrame is undefined", () => {
    const raf = (globalThis as any).requestAnimationFrame;
    const caf = (globalThis as any).cancelAnimationFrame;
    delete (globalThis as any).requestAnimationFrame;
    delete (globalThis as any).cancelAnimationFrame;

    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.markDirty();
    vi.advanceTimersByTime(20);
    expect(tick).toHaveBeenCalledTimes(1);
    s.stop();

    (globalThis as any).requestAnimationFrame = raf;
    (globalThis as any).cancelAnimationFrame = caf;
  });

  it("stop() before start() is a no-op (no raf to cancel)", () => {
    const tick = vi.fn();
    const s = new Scheduler(tick);
    // raf is null — the `this.raf != null` guard takes its false arm.
    expect(() => s.stop()).not.toThrow();
    expect(tick).not.toHaveBeenCalled();
  });

  it("a frame re-scheduled during a tick bails out once running is false", () => {
    const tick = vi.fn(() => {
      // Stopping mid-tick clears the in-flight handle, but loop() still
      // re-schedules a fresh frame afterward; that frame must early-return.
      s.stop();
    });
    const s = new Scheduler(tick);
    s.start();
    s.markDirty();
    vi.advanceTimersByTime(20);
    expect(tick).toHaveBeenCalledTimes(1);
    // The re-scheduled frame fires with running=false → loop early-returns,
    // so no further ticks.
    vi.advanceTimersByTime(100);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("uses clearTimeout when cancelAnimationFrame is undefined on stop", () => {
    const raf = (globalThis as any).requestAnimationFrame;
    const caf = (globalThis as any).cancelAnimationFrame;
    delete (globalThis as any).requestAnimationFrame;
    delete (globalThis as any).cancelAnimationFrame;

    const tick = vi.fn();
    const s = new Scheduler(tick);
    s.start();
    s.markDirty();
    vi.advanceTimersByTime(10);
    expect(() => s.stop()).not.toThrow();

    (globalThis as any).requestAnimationFrame = raf;
    (globalThis as any).cancelAnimationFrame = caf;
  });
});
