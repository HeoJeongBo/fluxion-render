import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeTicker, useSharedTicker } from "./shared-ticker";

describe("subscribeTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces same-interval subscribers onto one timer and fans out", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeTicker(100, a);
    const unsubB = subscribeTicker(100, b);
    // Both subscribers share a single underlying timer.
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // Each tick passes a numeric `now`.
    expect(typeof a.mock.calls[0]![0]).toBe("number");

    unsubA();
    unsubB();
  });

  it("keeps the timer alive until the last subscriber leaves", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeTicker(100, a);
    const unsubB = subscribeTicker(100, b);

    unsubA();
    expect(clearSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(a).not.toHaveBeenCalled(); // removed
    expect(b).toHaveBeenCalledTimes(1);

    unsubB();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("uses separate timers for different intervals", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeTicker(100, a);
    const unsubB = subscribeTicker(200, b);
    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    unsubA();
    unsubB();
  });

  it("a double unsubscribe is a no-op (does not double-clear)", () => {
    const a = vi.fn();
    const unsub = subscribeTicker(100, a);
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it("isolates a throwing subscriber so siblings still tick", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sibling = vi.fn();
    const unsubA = subscribeTicker(100, () => {
      throw new Error("pump boom");
    });
    const unsubB = subscribeTicker(100, sibling);

    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(sibling).toHaveBeenCalledTimes(1); // not skipped by the thrower
    expect(errSpy).toHaveBeenCalled();

    unsubA();
    unsubB();
    errSpy.mockRestore();
  });

  it("pauses ticking while the page is hidden", () => {
    const a = vi.fn();
    const unsub = subscribeTicker(100, a);

    // Simulate the page going hidden.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    vi.advanceTimersByTime(300);
    expect(a).not.toHaveBeenCalled();

    // Back to visible — ticking resumes.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);

    unsub();
  });
});

describe("useSharedTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes on mount, calls the latest fn, unsubscribes on unmount", () => {
    const first = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ fn }: { fn: () => void }) => useSharedTicker(40, () => fn()),
      { initialProps: { fn: first } },
    );

    vi.advanceTimersByTime(40);
    expect(first).toHaveBeenCalledTimes(1);

    // Unstable fn updates via ref without re-subscribing.
    const second = vi.fn();
    rerender({ fn: second });
    vi.advanceTimersByTime(40);
    expect(second).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(80);
    // No further calls after unmount.
    expect(second).toHaveBeenCalledTimes(1);
  });
});
