import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHostRecyclePool } from "./use-host-recycle-pool";

describe("useHostRecyclePool", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns a stable pool across re-renders and disposes it on unmount", () => {
    const { result, rerender, unmount } = renderHook(() =>
      useHostRecyclePool({ max: 4 }),
    );
    const pool = result.current;
    expect(pool.isDisposed).toBe(false);
    rerender();
    expect(result.current).toBe(pool); // stable across renders
    unmount();
    expect(pool.isDisposed).toBe(true); // disposed on unmount
  });

  it("defaults its options when none are passed", () => {
    const { result } = renderHook(() => useHostRecyclePool());
    expect(result.current.size).toBe(0);
    expect(result.current.stats).toEqual({ created: 0, recycled: 0 });
  });
});
