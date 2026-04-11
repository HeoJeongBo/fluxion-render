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
});
