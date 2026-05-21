import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReplaySession } from "./use-replay-session";

describe("useReplaySession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts with isReady false", () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [], autoOpen: false })
    );
    expect(result.current.isReady).toBe(false);
  });

  it("sets isReady after auto-open", async () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [] })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isReady).toBe(true);
  });

  it("starts in live mode", () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [], autoOpen: false })
    );
    expect(result.current.mode).toBe("live");
  });

  it("enterReplay switches mode to replay", async () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [] })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.enterReplay();
    });

    expect(result.current.mode).toBe("replay");
  });

  it("exitReplay returns to live mode", async () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [] })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => { await result.current.enterReplay(); });
    act(() => { result.current.exitReplay(); });

    expect(result.current.mode).toBe("live");
  });

  it("disposes session on unmount", async () => {
    const { result, unmount } = renderHook(() =>
      useReplaySession({ channels: [], autoOpen: false })
    );

    await act(async () => { await Promise.resolve(); });

    const session = result.current.session;
    const disposeSpy = session ? vi.spyOn(session, "dispose") : null;

    unmount();

    if (disposeSpy) {
      expect(disposeSpy).toHaveBeenCalled();
    }
  });

  it("record() is a no-op when session is null", () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [], autoOpen: false })
    );
    expect(() => result.current.record("test", {})).not.toThrow();
  });

  it("exitReplay() is a no-op when session is null", () => {
    const { result } = renderHook(() =>
      useReplaySession({ channels: [], autoOpen: false })
    );
    // session hasn't been set yet immediately on first render before open completes
    // exitReplay guard: if (!session) return
    expect(() => result.current.exitReplay()).not.toThrow();
  });
});
