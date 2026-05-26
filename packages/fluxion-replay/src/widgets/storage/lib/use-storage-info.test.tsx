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

  it("logs to console when logToConsole is true", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    vi.spyOn(session, "getStorageInfo").mockResolvedValue({
      usedBytes: 1_048_576,
      quotaBytes: 10_485_760,
      percentUsed: 10,
      idbFrameCount: 42,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { unmount } = renderHook(() =>
      useStorageInfo(session, { intervalMs: 5000, logToConsole: true }),
    );
    await act(async () => { await Promise.resolve(); });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[useStorageInfo]"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("10.0% used"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("42 frames"));

    unmount();
    session.dispose();
    logSpy.mockRestore();
  });

  it("does not log to console when logToConsole is false (default)", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    vi.spyOn(session, "getStorageInfo").mockResolvedValue({
      usedBytes: 100,
      quotaBytes: 1000,
      percentUsed: 10,
      idbFrameCount: 1,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { unmount } = renderHook(() => useStorageInfo(session, { intervalMs: 5000 }));
    await act(async () => { await Promise.resolve(); });

    expect(logSpy).not.toHaveBeenCalled();

    unmount();
    session.dispose();
    logSpy.mockRestore();
  });
});
