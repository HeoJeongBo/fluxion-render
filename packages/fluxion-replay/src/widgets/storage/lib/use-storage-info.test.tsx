import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplaySession } from "../../../features/session/model/replay-session";
import { useStorageInfo } from "./use-storage-info";

describe("useStorageInfo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns null initially", () => {
    const { result } = renderHook(() => useStorageInfo(null));
    expect(result.current).toBeNull();
  });

  it("fetches and returns StorageInfo on mount", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();

    const { result } = renderHook(() => useStorageInfo(session, { intervalMs: 10_000 }));
    await act(async () => { await Promise.resolve(); });

    expect(result.current).not.toBeNull();
    expect(typeof result.current?.usedBytes).toBe("number");
    expect(typeof result.current?.percentUsed).toBe("number");
    session.dispose();
  });

  it("re-fetches on interval", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();

    let callCount = 0;
    vi.spyOn(session, "getStorageInfo").mockImplementation(async () => {
      callCount++;
      return { usedBytes: callCount * 1000, quotaBytes: 1_000_000_000, percentUsed: 0.001 * callCount, idbFrameCount: callCount };
    });

    const { result } = renderHook(() => useStorageInfo(session, { intervalMs: 500 }));
    await act(async () => { await Promise.resolve(); });
    const firstCount = result.current?.idbFrameCount ?? 0;

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect((result.current?.idbFrameCount ?? 0)).toBeGreaterThan(firstCount);
    session.dispose();
  });

  it("clears interval on unmount", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const session = new ReplaySession({ channels: [] });
    await session.open();

    const { unmount } = renderHook(() => useStorageInfo(session, { intervalMs: 5000 }));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    session.dispose();
    clearSpy.mockRestore();
  });

  it("ignores errors silently", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    vi.spyOn(session, "getStorageInfo").mockRejectedValue(new Error("quota error"));

    const { result } = renderHook(() => useStorageInfo(session));
    await act(async () => { await Promise.resolve(); });

    expect(result.current).toBeNull();
    session.dispose();
  });
});
