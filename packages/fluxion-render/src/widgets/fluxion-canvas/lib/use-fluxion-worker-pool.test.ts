import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDispose = vi.fn();
const mockAcquire = vi.fn();

vi.mock("../../../features/worker-pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../features/worker-pool")>();
  class MockFluxionWorkerPool {
    dispose = mockDispose;
    acquire = mockAcquire;
  }
  return { ...actual, FluxionWorkerPool: MockFluxionWorkerPool };
});

import { FluxionWorkerPool } from "../../../features/worker-pool";
import { useFluxionWorkerPool } from "./use-fluxion-worker-pool";

function makeOpts() {
  return {
    size: 2,
    workerFactory: vi.fn() as unknown as () => Worker,
  };
}

const PoolSpy = vi.spyOn({ FluxionWorkerPool }, "FluxionWorkerPool");

describe("useFluxionWorkerPool", () => {
  beforeEach(() => {
    mockDispose.mockClear();
    mockAcquire.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a FluxionWorkerPool instance on mount", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useFluxionWorkerPool(opts));
    expect(result.current).toBeInstanceOf(FluxionWorkerPool);
  });

  it("disposes the pool on unmount", () => {
    const opts = makeOpts();
    const { result, unmount } = renderHook(() => useFluxionWorkerPool(opts));
    const pool = result.current;
    unmount();
    expect(pool.dispose).toHaveBeenCalledTimes(1);
  });

  it("returns the same pool instance across re-renders", () => {
    const opts = makeOpts();
    const { result, rerender } = renderHook(() => useFluxionWorkerPool(opts));
    const first = result.current;
    rerender();
    const second = result.current;
    expect(first).toBe(second);
  });

  it("does not create a new pool on multiple re-renders", () => {
    const opts = makeOpts();
    const { result, rerender } = renderHook(() => useFluxionWorkerPool(opts));
    const first = result.current;
    rerender();
    rerender();
    rerender();
    expect(result.current).toBe(first);
  });

  it("pool is not disposed until unmount", () => {
    const opts = makeOpts();
    const { result, rerender } = renderHook(() => useFluxionWorkerPool(opts));
    rerender();
    rerender();
    expect(result.current.dispose).not.toHaveBeenCalled();
  });
});
