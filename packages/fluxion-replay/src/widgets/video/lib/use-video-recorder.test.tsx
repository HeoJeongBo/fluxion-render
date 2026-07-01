import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplaySession } from "../../../features/session/model/replay-session";
import { VideoRecorder } from "../../../features/video/model/video-recorder";
import { useVideoRecorder } from "./use-video-recorder";

/** Minimal fake session exposing the `store`/`recorder` the hook reads. */
function makeSession(): ReplaySession {
  return { store: {}, recorder: {} } as unknown as ReplaySession;
}

const TRACK = {} as MediaStreamTrack;

describe("useVideoRecorder", () => {
  beforeEach(() => {
    vi.spyOn(VideoRecorder.prototype, "start").mockResolvedValue(undefined);
    vi.spyOn(VideoRecorder.prototype, "stop").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("is a no-op when isRecording is false", () => {
    const startSpy = VideoRecorder.prototype.start as ReturnType<typeof vi.fn>;
    renderHook(() =>
      useVideoRecorder({
        channelId: "screen",
        session: makeSession(),
        isRecording: false,
        track: TRACK,
      }),
    );
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when session is null", () => {
    const startSpy = VideoRecorder.prototype.start as ReturnType<typeof vi.fn>;
    renderHook(() =>
      useVideoRecorder({
        channelId: "screen",
        session: null,
        isRecording: true,
        track: TRACK,
      }),
    );
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when track is null", () => {
    const startSpy = VideoRecorder.prototype.start as ReturnType<typeof vi.fn>;
    renderHook(() =>
      useVideoRecorder({
        channelId: "screen",
        session: makeSession(),
        isRecording: true,
        track: null,
      }),
    );
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("constructs a VideoRecorder and starts it with the track when all deps present", () => {
    const startSpy = VideoRecorder.prototype.start as ReturnType<typeof vi.fn>;
    renderHook(() =>
      useVideoRecorder({
        channelId: "screen",
        session: makeSession(),
        isRecording: true,
        track: TRACK,
      }),
    );
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledWith(TRACK);
  });

  it("accepts custom encoding options without throwing", () => {
    const startSpy = VideoRecorder.prototype.start as ReturnType<typeof vi.fn>;
    expect(() =>
      renderHook(() =>
        useVideoRecorder({
          channelId: "cam",
          session: makeSession(),
          isRecording: true,
          track: TRACK,
          width: 1920,
          height: 1080,
          bitrate: 5_000_000,
          framerate: 60,
        }),
      ),
    ).not.toThrow();
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it("warns when start() rejects, without throwing", async () => {
    (VideoRecorder.prototype.start as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHook(() =>
      useVideoRecorder({
        channelId: "screen",
        session: makeSession(),
        isRecording: true,
        track: TRACK,
      }),
    );
    // Let the rejected start() promise's catch run.
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith(
      "[useVideoRecorder] VideoRecorder failed to start:",
      expect.any(Error),
    );
  });

  it("stops the recorder on unmount", () => {
    const stopSpy = VideoRecorder.prototype.stop as ReturnType<typeof vi.fn>;
    const { unmount } = renderHook(() =>
      useVideoRecorder({
        channelId: "screen",
        session: makeSession(),
        isRecording: true,
        track: TRACK,
      }),
    );
    unmount();
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards onWriteError and re-creates the recorder when its identity changes", () => {
    const starts: VideoRecorder[] = [];
    (VideoRecorder.prototype.start as ReturnType<typeof vi.fn>).mockImplementation(
      function (this: VideoRecorder) {
        starts.push(this);
        return Promise.resolve();
      },
    );
    const stopSpy = VideoRecorder.prototype.stop as ReturnType<typeof vi.fn>;
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const session = makeSession();
    const { rerender } = renderHook(
      ({ cb }: { cb: (error: unknown) => void }) =>
        useVideoRecorder({
          channelId: "screen",
          session,
          isRecording: true,
          track: TRACK,
          onWriteError: cb,
        }),
      { initialProps: { cb: cb1 } },
    );
    expect(starts).toHaveLength(1);
    // biome-ignore lint/suspicious/noExplicitAny: reading private field
    expect((starts[0] as any)._onWriteError).toBe(cb1);

    // A new callback identity re-runs the effect: stop old, start a fresh recorder.
    rerender({ cb: cb2 });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(starts).toHaveLength(2);
    // biome-ignore lint/suspicious/noExplicitAny: reading private field
    expect((starts[1] as any)._onWriteError).toBe(cb2);
  });

  it("stops the recorder when isRecording flips true → false", () => {
    const stopSpy = VideoRecorder.prototype.stop as ReturnType<typeof vi.fn>;
    const session = makeSession();
    const { rerender } = renderHook(
      ({ rec }: { rec: boolean }) =>
        useVideoRecorder({
          channelId: "screen",
          session,
          isRecording: rec,
          track: TRACK,
        }),
      { initialProps: { rec: true } },
    );
    expect(stopSpy).not.toHaveBeenCalled();
    rerender({ rec: false });
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});
