import { describe, expect, it, vi } from "vitest";
import { ReplayStore } from "../../store/model/replay-store";
import { ReplayRecorder } from "../../recorder/model/replay-recorder";
import { VideoChannel } from "../../../entities/video-channel/video-channel";
import { VideoRecorder } from "./video-recorder";

async function makeOpenRecorder() {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  await store.open();
  const recorder = new ReplayRecorder({
    channels: [new VideoChannel("cam")],
    store,
  });
  recorder.start();
  return { store, recorder };
}

function makeRecorder() {
  const store = new ReplayStore({ batchIntervalMs: 9999 });
  const recorder = new ReplayRecorder({
    channels: [new VideoChannel("cam")],
    store,
  });
  recorder.start();
  return { store, recorder };
}

describe("VideoRecorder", () => {
  it("isRunning is false by default", () => {
    const { store, recorder } = makeRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    expect(vr.isRunning).toBe(false);
  });

  it("stop() is safe to call before start()", () => {
    const { store, recorder } = makeRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    expect(() => vr.stop()).not.toThrow();
  });

  it("uses fallback when VideoEncoder is not available", async () => {
    const origVideoEncoder = globalThis.VideoEncoder;
    Object.defineProperty(globalThis, "VideoEncoder", { value: undefined, writable: true, configurable: true });

    const { store, recorder } = makeRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const track = {} as MediaStreamTrack;
    await vr.start(track);
    expect(vr.isRunning).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("WebCodecs"));

    vr.stop();
    warnSpy.mockRestore();
    Object.defineProperty(globalThis, "VideoEncoder", { value: origVideoEncoder, writable: true, configurable: true });
  });

  it("stop() sets isRunning to false", async () => {
    const { store, recorder } = makeRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    const track = {} as MediaStreamTrack;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await vr.start(track);
    vr.stop();
    expect(vr.isRunning).toBe(false);
  });

  it("start() is a no-op when already running", async () => {
    const { store, recorder } = makeRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const track = {} as MediaStreamTrack;
    await vr.start(track);
    await vr.start(track); // second call should be ignored
    expect(vr.isRunning).toBe(true);
    vr.stop();
  });

  it("uses WebCodecs path via MediaStreamTrackProcessor when available", async () => {
    const { store, recorder } = await makeOpenRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    const track = {} as MediaStreamTrack;
    await vr.start(track);
    // MediaStreamTrackProcessor stub closes the stream immediately, so _readLoop exits
    expect(vr.isRunning).toBe(true);
    vr.stop();
    expect(vr.isRunning).toBe(false);
  });

  it("_readLoop processes frames from stream", async () => {
    const { store, recorder } = await makeOpenRecorder();
    const origMSTP = globalThis.MediaStreamTrackProcessor;

    // Create a stream that yields one frame then closes
    const fakeFrame = { close: vi.fn() } as unknown as VideoFrame;
    class OneFrameProcessor {
      readable: ReadableStream<VideoFrame>;
      constructor(_init: unknown) {
        this.readable = new ReadableStream<VideoFrame>({
          start(controller) {
            controller.enqueue(fakeFrame);
            controller.close();
          },
        });
      }
    }
    Object.defineProperty(globalThis, "MediaStreamTrackProcessor", {
      value: OneFrameProcessor, writable: true, configurable: true,
    });

    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    const track = {} as MediaStreamTrack;
    await vr.start(track);
    // Let _readLoop complete
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeFrame.close).toHaveBeenCalled();
    vr.stop();
    Object.defineProperty(globalThis, "MediaStreamTrackProcessor", {
      value: origMSTP, writable: true, configurable: true,
    });
  });

  it("uses fallback when MediaStreamTrackProcessor is not available", async () => {
    const origMSTP = globalThis.MediaStreamTrackProcessor;
    Object.defineProperty(globalThis, "MediaStreamTrackProcessor", {
      value: undefined, writable: true, configurable: true,
    });

    const { store, recorder } = makeRecorder();
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const track = {} as MediaStreamTrack;
    await vr.start(track);
    expect(vr.isRunning).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("MediaStreamTrackProcessor"));

    vr.stop();
    warnSpy.mockRestore();
    Object.defineProperty(globalThis, "MediaStreamTrackProcessor", {
      value: origMSTP, writable: true, configurable: true,
    });
  });

  it("VideoEncoder error callback does not throw", async () => {
    const { store, recorder } = await makeOpenRecorder();
    let capturedError: ((e: Error) => void) | null = null;
    const origVideoEncoder = globalThis.VideoEncoder;
    class ErrorCapturingEncoder {
      state = "unconfigured";
      constructor(init: { output: unknown; error: (e: Error) => void }) {
        capturedError = init.error;
      }
      configure(_config: unknown) { this.state = "configured"; }
      encode(_frame: unknown, _opts?: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoEncoder", {
      value: ErrorCapturingEncoder, writable: true, configurable: true,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    await vr.start({} as MediaStreamTrack);
    capturedError!(new Error("encode error"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("VideoEncoder"), expect.any(Error));

    vr.stop();
    errorSpy.mockRestore();
    Object.defineProperty(globalThis, "VideoEncoder", {
      value: origVideoEncoder, writable: true, configurable: true,
    });
  });

  it("_readLoop breaks on reader.read() rejection", async () => {
    const { store, recorder } = await makeOpenRecorder();
    const origMSTP = globalThis.MediaStreamTrackProcessor;

    class ThrowingProcessor {
      readable: ReadableStream<VideoFrame>;
      constructor(_init: unknown) {
        this.readable = new ReadableStream<VideoFrame>({
          start(_controller) {
            // Never enqueue, never close — read() will hang, but we test the catch path
            // by making the stream throw
          },
          pull(controller) {
            controller.error(new Error("stream error"));
          },
        });
      }
    }
    Object.defineProperty(globalThis, "MediaStreamTrackProcessor", {
      value: ThrowingProcessor, writable: true, configurable: true,
    });

    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    await vr.start({} as MediaStreamTrack);
    // Let _readLoop catch the error and break
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(vr.isRunning).toBe(true); // isRunning was set before the loop
    vr.stop();

    Object.defineProperty(globalThis, "MediaStreamTrackProcessor", {
      value: origMSTP, writable: true, configurable: true,
    });
  });

  it("_onEncodedChunk writes chunk to store and records frame", async () => {
    const { store, recorder } = await makeOpenRecorder();
    const recordSpy = vi.spyOn(recorder, "record");

    // Provide a VideoEncoder that immediately outputs a chunk on encode()
    const origVideoEncoder = globalThis.VideoEncoder;
    let capturedOutput: ((chunk: EncodedVideoChunk, meta: unknown) => void) | null = null;
    class ImmediateVideoEncoder {
      state = "unconfigured";
      constructor(init: { output: (chunk: EncodedVideoChunk, meta: unknown) => void; error: (e: Error) => void }) {
        capturedOutput = init.output;
      }
      configure(_config: unknown) { this.state = "configured"; }
      encode(_frame: unknown, _opts?: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoEncoder", {
      value: ImmediateVideoEncoder, writable: true, configurable: true,
    });

    const vr = new VideoRecorder({ channelId: "cam", store, recorder });
    const track = {} as MediaStreamTrack;
    await vr.start(track);

    // Manually trigger _onEncodedChunk by calling the captured output callback
    const chunk = new EncodedVideoChunk({
      type: "key",
      timestamp: 0,
      duration: 33333,
      data: new Uint8Array([1, 2, 3]).buffer,
    });
    capturedOutput!(chunk, {});

    // Flush async chain: writeVideoChunk (OPFS) + record()
    for (let i = 0; i < 10; i++) await Promise.resolve();

    vr.stop();

    Object.defineProperty(globalThis, "VideoEncoder", {
      value: origVideoEncoder, writable: true, configurable: true,
    });

    expect(recordSpy).toHaveBeenCalledWith(
      "cam",
      expect.objectContaining({ isKeyframe: true }),
      expect.any(Number),
    );
  });
});
