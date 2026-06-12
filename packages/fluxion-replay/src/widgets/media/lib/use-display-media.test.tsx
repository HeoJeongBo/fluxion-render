import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDisplayMedia } from "./use-display-media";

function makeFakeStream(): MediaStream {
  const track = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe("useDisplayMedia", () => {
  beforeEach(() => {
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockResolvedValue(
      makeFakeStream(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with null stream", () => {
    const { result } = renderHook(() => useDisplayMedia());
    expect(result.current.stream).toBeNull();
  });

  it("start() sets the stream", async () => {
    const { result } = renderHook(() => useDisplayMedia());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.stream).not.toBeNull();
  });

  it("stop() clears the stream", async () => {
    const { result } = renderHook(() => useDisplayMedia());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.stream).toBeNull();
  });

  it("start() rejects when getDisplayMedia throws (e.g. user denies)", async () => {
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockRejectedValue(
      Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }),
    );
    const { result } = renderHook(() => useDisplayMedia());
    await expect(
      act(async () => {
        await result.current.start();
      }),
    ).rejects.toThrow();
    expect(result.current.stream).toBeNull();
  });

  it("stop() on unmount cleans up stream tracks", async () => {
    const fakeStream = makeFakeStream();
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockResolvedValue(fakeStream);

    const { result, unmount } = renderHook(() => useDisplayMedia());
    await act(async () => {
      await result.current.start();
    });

    unmount();

    const tracks = fakeStream.getTracks();
    for (const t of tracks) {
      expect(t.stop as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    }
  });

  it("start() replaces an existing stream", async () => {
    const first = makeFakeStream();
    const second = makeFakeStream();
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia")
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const { result } = renderHook(() => useDisplayMedia());
    await act(async () => {
      await result.current.start();
    });
    const firstStream = result.current.stream;
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.stream).not.toBe(firstStream);
    // First stream tracks should have been stopped
    for (const t of first.getTracks()) {
      expect(t.stop as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    }
  });
});
