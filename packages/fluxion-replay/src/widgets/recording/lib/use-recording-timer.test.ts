import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordingTimer } from "./use-recording-timer";

describe("useRecordingTimer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns 0 when not recording", () => {
    const { result } = renderHook(() => useRecordingTimer({ isRecording: false }));
    expect(result.current.elapsedSec).toBe(0);
  });

  it("returns 0 while recording hasn't advanced yet", () => {
    const { result } = renderHook(() => useRecordingTimer({ isRecording: true }));
    expect(result.current.elapsedSec).toBe(0);
  });

  it("increments elapsedSec every second while recording", async () => {
    const { result } = renderHook(() => useRecordingTimer({ isRecording: true }));
    expect(result.current.elapsedSec).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.elapsedSec).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedSec).toBe(3);
  });

  it("resets to 0 when recording stops", async () => {
    const { result, rerender } = renderHook(
      ({ rec }: { rec: boolean }) => useRecordingTimer({ isRecording: rec }),
      { initialProps: { rec: true } },
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.elapsedSec).toBe(5);

    rerender({ rec: false });
    expect(result.current.elapsedSec).toBe(0);
  });

  it("restarts from 0 on a new recording session", async () => {
    const { result, rerender } = renderHook(
      ({ rec }: { rec: boolean }) => useRecordingTimer({ isRecording: rec }),
      { initialProps: { rec: true } },
    );

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.elapsedSec).toBe(3);

    // Stop
    rerender({ rec: false });
    expect(result.current.elapsedSec).toBe(0);

    // Start again — timer should begin fresh
    rerender({ rec: true });
    expect(result.current.elapsedSec).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.elapsedSec).toBe(2);
  });

  it("clears the interval on unmount", async () => {
    const { unmount } = renderHook(() => useRecordingTimer({ isRecording: true }));
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
