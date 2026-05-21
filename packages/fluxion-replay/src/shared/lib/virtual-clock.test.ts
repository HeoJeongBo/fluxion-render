import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VirtualClock } from "./virtual-clock";

describe("VirtualClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the given virtualStartMs", () => {
    const clock = new VirtualClock();
    clock.start(1000);
    expect(clock.currentT).toBeCloseTo(1000, 0);
    clock.stop();
  });

  it("advances currentT with real time at 1x rate", () => {
    const clock = new VirtualClock();
    clock.start(0, 1.0);
    vi.advanceTimersByTime(500);
    expect(clock.currentT).toBeCloseTo(500, -1);
    clock.stop();
  });

  it("advances at 2x rate", () => {
    const clock = new VirtualClock();
    clock.start(0, 2.0);
    vi.advanceTimersByTime(1000);
    expect(clock.currentT).toBeCloseTo(2000, -1);
    clock.stop();
  });

  it("pause freezes currentT", () => {
    const clock = new VirtualClock();
    clock.start(0, 1.0);
    vi.advanceTimersByTime(300);
    clock.pause();
    const frozenT = clock.currentT;
    vi.advanceTimersByTime(1000);
    expect(clock.currentT).toBeCloseTo(frozenT, 0);
    clock.stop();
  });

  it("resume continues from paused position", () => {
    const clock = new VirtualClock();
    clock.start(0, 1.0);
    vi.advanceTimersByTime(200);
    clock.pause();
    const pausedT = clock.currentT;
    vi.advanceTimersByTime(500); // wall time passes but virtual does not
    clock.resume();
    vi.advanceTimersByTime(100);
    expect(clock.currentT).toBeCloseTo(pausedT + 100, -1);
    clock.stop();
  });

  it("seek jumps to new position without stopping", () => {
    const clock = new VirtualClock();
    clock.start(0, 1.0);
    vi.advanceTimersByTime(200);
    clock.seek(5000);
    vi.advanceTimersByTime(100);
    expect(clock.currentT).toBeCloseTo(5100, -1);
    clock.stop();
  });

  it("setRate changes speed mid-playback", () => {
    const clock = new VirtualClock();
    clock.start(0, 1.0);
    vi.advanceTimersByTime(1000);
    clock.setRate(0.5);
    vi.advanceTimersByTime(1000);
    expect(clock.currentT).toBeCloseTo(1500, -1);
    clock.stop();
  });

  it("stop resets clock state", () => {
    const clock = new VirtualClock();
    clock.start(500);
    clock.stop();
    expect(clock.isRunning).toBe(false);
    expect(clock.currentT).toBe(0);
  });

  it("onTick listener fires and can be removed", () => {
    const clock = new VirtualClock();
    const ticks: number[] = [];
    const off = clock.onTick((t) => ticks.push(t));
    clock.start(0, 1.0);
    vi.advanceTimersByTime(32);
    off();
    const countAfterOff = ticks.length;
    vi.advanceTimersByTime(32);
    expect(ticks.length).toBe(countAfterOff); // no more ticks after removal
    clock.stop();
  });

  it("dispose clears listeners and stops", () => {
    const clock = new VirtualClock();
    const ticks: number[] = [];
    clock.onTick((t) => ticks.push(t));
    clock.start(0);
    clock.dispose();
    expect(clock.isRunning).toBe(false);
  });

  it("isRunning reflects state correctly", () => {
    const clock = new VirtualClock();
    expect(clock.isRunning).toBe(false);
    clock.start(0);
    expect(clock.isRunning).toBe(true);
    clock.pause();
    expect(clock.isRunning).toBe(false);
    clock.resume();
    expect(clock.isRunning).toBe(true);
    clock.stop();
    expect(clock.isRunning).toBe(false);
  });

  it("rate getter returns current rate", () => {
    const clock = new VirtualClock();
    clock.start(0, 2.5);
    expect(clock.rate).toBe(2.5);
    clock.stop();
  });

  it("setRate while paused updates rate without resuming", () => {
    const clock = new VirtualClock();
    clock.start(0, 1.0);
    clock.pause();
    clock.setRate(3.0);
    expect(clock.rate).toBe(3.0);
    expect(clock.isRunning).toBe(false);
    clock.stop();
  });

  it("currentT returns _startVirtualMs when not running", () => {
    const clock = new VirtualClock();
    expect(clock.currentT).toBe(0);
  });

  it("resume is a no-op when already running", () => {
    const clock = new VirtualClock();
    clock.start(0);
    expect(() => clock.resume()).not.toThrow();
    clock.stop();
  });

  it("pause is a no-op when not running", () => {
    const clock = new VirtualClock();
    expect(() => clock.pause()).not.toThrow();
  });

  it("stop is safe when never started", () => {
    const clock = new VirtualClock();
    expect(() => clock.stop()).not.toThrow();
  });

  it("visibilitychange: pauses on hidden, resumes on visible", () => {
    const clock = new VirtualClock();
    clock.start(0);
    expect(clock.isRunning).toBe(true);

    Object.defineProperty(document, "visibilityState", { value: "hidden", writable: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(clock.isRunning).toBe(false);

    Object.defineProperty(document, "visibilityState", { value: "visible", writable: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(clock.isRunning).toBe(true);

    clock.stop();
  });

  it("visibilitychange: does not resume if was manually paused", () => {
    const clock = new VirtualClock();
    clock.start(0);
    clock.pause(); // manually paused — _pausedByVisibility is false

    Object.defineProperty(document, "visibilityState", { value: "visible", writable: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    // Should not resume since _pausedByVisibility is false
    expect(clock.isRunning).toBe(false);
    clock.stop();
  });

  it("falls back to setTimeout when requestAnimationFrame is unavailable", () => {
    const origRaf = globalThis.requestAnimationFrame;
    const origCaf = globalThis.cancelAnimationFrame;
    // @ts-expect-error intentionally removing raf
    delete globalThis.requestAnimationFrame;
    // @ts-expect-error intentionally removing caf
    delete globalThis.cancelAnimationFrame;

    const clock = new VirtualClock();
    clock.start(0, 1.0);
    expect(clock.isRunning).toBe(true);
    vi.advanceTimersByTime(32);
    expect(clock.currentT).toBeGreaterThan(0);
    clock.stop();

    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCaf;
  });
});
