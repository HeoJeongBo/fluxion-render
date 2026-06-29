import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStaggeredMount } from "./use-staggered-mount";

describe("useStaggeredMount", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // One animation frame (rAF ~16ms; advance 20 to be safe).
  const frame = () =>
    act(() => {
      vi.advanceTimersByTime(20);
    });

  it("shows the first batch immediately, then ramps to total one batch per frame", () => {
    const { result } = renderHook(() => useStaggeredMount(10, { perFrame: 3 }));
    expect(result.current).toBe(3); // first batch is synchronous (no flash to 0)
    frame();
    expect(result.current).toBe(6);
    frame();
    expect(result.current).toBe(9);
    frame();
    expect(result.current).toBe(10);
    frame();
    expect(result.current).toBe(10); // settled — no overshoot, no extra work
  });

  it("returns total immediately when total <= perFrame (no delay for small lists)", () => {
    const { result } = renderHook(() => useStaggeredMount(5, { perFrame: 16 }));
    expect(result.current).toBe(5);
    frame();
    expect(result.current).toBe(5);
  });

  it("disabled returns total immediately with no ramp", () => {
    const { result } = renderHook(() =>
      useStaggeredMount(100, { perFrame: 4, disabled: true }),
    );
    expect(result.current).toBe(100);
    frame();
    expect(result.current).toBe(100);
  });

  it("uses the default perFrame of 16", () => {
    const { result } = renderHook(() => useStaggeredMount(40));
    expect(result.current).toBe(16);
    frame();
    expect(result.current).toBe(32);
    frame();
    expect(result.current).toBe(40);
  });

  it("continues ramping (without resetting) when total grows", () => {
    const { result, rerender } = renderHook(
      ({ total }) => useStaggeredMount(total, { perFrame: 4 }),
      { initialProps: { total: 8 } },
    );
    expect(result.current).toBe(4);
    frame();
    expect(result.current).toBe(8); // ramp complete for the original total
    rerender({ total: 16 });
    frame();
    expect(result.current).toBe(12); // resumes from 8, no reset to the first batch
    frame();
    expect(result.current).toBe(16);
  });

  it("clamps to a shrunk total immediately", () => {
    const { result, rerender } = renderHook(
      ({ total }) => useStaggeredMount(total, { perFrame: 50 }),
      { initialProps: { total: 100 } },
    );
    expect(result.current).toBe(50);
    rerender({ total: 20 }); // shrink below the already-shown count
    expect(result.current).toBe(20);
  });

  it("cancels the pending frame on unmount (no late state update / throw)", () => {
    const { result, unmount } = renderHook(() => useStaggeredMount(100, { perFrame: 5 }));
    expect(result.current).toBe(5);
    unmount();
    expect(() => frame()).not.toThrow();
  });
});
