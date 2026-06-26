import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureMountScheduler, enqueueMount } from "./mount-scheduler";

/** Advance one animation frame (fires the faked rAF / setTimeout drain). */
function frame() {
  vi.advanceTimersByTime(20);
}

describe("mount-scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    configureMountScheduler({ perFrame: 4 }); // reset module default for the next test
  });

  it("runs at most perFrame tasks per frame, rescheduling until drained", () => {
    configureMountScheduler({ perFrame: 2 });
    const order: number[] = [];
    for (let i = 0; i < 5; i++) enqueueMount(() => order.push(i));
    // Nothing runs synchronously — the burst is deferred.
    expect(order).toEqual([]);
    frame();
    expect(order).toEqual([0, 1]);
    frame();
    expect(order).toEqual([0, 1, 2, 3]);
    frame();
    expect(order).toEqual([0, 1, 2, 3, 4]);
    frame(); // queue drained → nothing scheduled, no-op
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it("dedupes the scheduled frame while one is already pending", () => {
    configureMountScheduler({ perFrame: 1 });
    const order: number[] = [];
    enqueueMount(() => order.push(0));
    enqueueMount(() => order.push(1)); // second enqueue: a frame is already scheduled
    frame();
    expect(order).toEqual([0]); // only perFrame=1 ran on the single frame
    frame();
    expect(order).toEqual([0, 1]);
  });

  it("cancel removes a not-yet-run task; cancelling after it ran is a no-op", () => {
    const ran: string[] = [];
    const cancelA = enqueueMount(() => ran.push("a"));
    enqueueMount(() => ran.push("b"));
    cancelA(); // remove A before its frame
    frame();
    expect(ran).toEqual(["b"]);
    cancelA(); // already gone → no-op, must not throw
    expect(ran).toEqual(["b"]);
  });

  it("isolates a throwing task so later ones in the batch still run", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ran: string[] = [];
    enqueueMount(() => {
      throw new Error("boom");
    });
    enqueueMount(() => ran.push("ok"));
    frame();
    expect(ran).toEqual(["ok"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ignores non-positive / missing perFrame", () => {
    configureMountScheduler({ perFrame: 3 });
    configureMountScheduler({ perFrame: 0 }); // ignored
    configureMountScheduler({ perFrame: -1 }); // ignored
    configureMountScheduler({}); // ignored (undefined)
    const order: number[] = [];
    for (let i = 0; i < 4; i++) enqueueMount(() => order.push(i));
    frame();
    expect(order).toEqual([0, 1, 2]); // perFrame stayed 3
    frame(); // drain the leftover so module state resets cleanly
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("falls back to setTimeout when requestAnimationFrame is unavailable", () => {
    const raf = globalThis.requestAnimationFrame;
    // @ts-expect-error force the no-rAF (worker/SSR) fallback path
    globalThis.requestAnimationFrame = undefined;
    try {
      const ran: string[] = [];
      enqueueMount(() => ran.push("via-timeout"));
      expect(ran).toEqual([]);
      vi.advanceTimersByTime(20); // fires the setTimeout(…, 16)
      expect(ran).toEqual(["via-timeout"]);
    } finally {
      globalThis.requestAnimationFrame = raf;
    }
  });
});
