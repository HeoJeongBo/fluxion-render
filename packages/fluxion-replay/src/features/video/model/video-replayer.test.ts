import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayStore } from "../../store/model/replay-store";
import { VideoReplayer } from "./video-replayer";

function makeCanvas(): HTMLCanvasElement {
  return { getContext: () => ({ drawImage: vi.fn() }) } as unknown as HTMLCanvasElement;
}

describe("VideoReplayer", () => {
  let store: ReplayStore;

  beforeEach(async () => {
    store = new ReplayStore({ batchIntervalMs: 9999 });
    await store.open();
  });

  it("feedFrame is a no-op for wrong channelId", () => {
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    expect(() =>
      replayer.feedFrame({ channelId: "other", data: {}, t: 0 })
    ).not.toThrow();
    replayer.dispose();
  });

  it("dispose() does not throw", () => {
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    expect(() => replayer.dispose()).not.toThrow();
  });

  it("feedFrame with correct channelId attempts decode", async () => {
    const canvas = makeCanvas();
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });

    await store.writeVideoChunk("cam", "1000.chunk", new Uint8Array([1, 2, 3]));

    expect(() =>
      replayer.feedFrame({
        channelId: "cam",
        data: {
          opfsPath: "video/cam/1000.chunk",
          isKeyframe: true,
          durationUs: 33333,
          byteLength: 3,
        },
        t: 1000,
      })
    ).not.toThrow();

    replayer.dispose();
  });

  it("seekTo with empty frames does nothing", async () => {
    const { TimelineIndex } = await import("../../timeline/model/timeline-index");
    const idx = new TimelineIndex();
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    await expect(replayer.seekTo(1000, idx, [])).resolves.toBeUndefined();
    replayer.dispose();
  });

  it("seekTo with indexed keyframe decodes frames in range", async () => {
    const { TimelineIndex } = await import("../../timeline/model/timeline-index");
    const idx = new TimelineIndex();
    idx.insert(0);

    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));

    const frames = [
      {
        channelId: "cam",
        data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3 },
        t: 0,
      },
    ];

    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    await expect(replayer.seekTo(500, idx, frames)).resolves.toBeUndefined();
    replayer.dispose();
  });

  it("VideoDecoder error callback logs and does not throw", async () => {
    const origVideoDecoder = globalThis.VideoDecoder;
    let capturedError: ((e: Error) => void) | null = null;
    class ErrorCapturingDecoder {
      state = "unconfigured";
      constructor(init: { output: unknown; error: (e: Error) => void }) {
        capturedError = init.error;
      }
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: ErrorCapturingDecoder, writable: true, configurable: true,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/x.chunk", isKeyframe: true, durationUs: 0, byteLength: 0 },
      t: 0,
    });
    // Flush so decoder is set up
    for (let i = 0; i < 5; i++) await Promise.resolve();

    capturedError!(new Error("decode error"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("VideoReplayer"), expect.any(Error));

    errorSpy.mockRestore();
    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("seekTo resets existing decoder before decoding", async () => {
    const { TimelineIndex } = await import("../../timeline/model/timeline-index");
    const idx = new TimelineIndex();
    idx.insert(0);

    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));

    const frames = [
      {
        channelId: "cam",
        data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3 },
        t: 0,
      },
    ];

    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    // First seek sets up decoder
    await replayer.seekTo(500, idx, frames);
    // Second seek resets the existing decoder (exercises _resetDecoder with existing _decoder)
    await replayer.seekTo(500, idx, frames);
    replayer.dispose();
  });

  it("feedFrame triggers decode and renders to canvas", async () => {
    const drawImage = vi.fn();
    const canvas = { getContext: () => ({ drawImage }) } as unknown as HTMLCanvasElement;

    await store.writeVideoChunk("cam", "1000.chunk", new Uint8Array([4, 5, 6]));

    // Capture the decoder's output callback so we can call it after the async store read
    const origVideoDecoder = globalThis.VideoDecoder;
    let capturedOutput: ((frame: VideoFrame) => void) | null = null;
    class CapturingVideoDecoder {
      state = "unconfigured";
      constructor(init: { output: (frame: VideoFrame) => void; error: (e: Error) => void }) {
        capturedOutput = init.output;
      }
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: CapturingVideoDecoder, writable: true, configurable: true,
    });

    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/1000.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3 },
      t: 1000,
    });

    // Flush async OPFS read in _decodeChunk
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // Now manually fire the output callback to exercise _renderFrame
    const frame = { timestamp: 0, duration: null, close: () => {} } as unknown as VideoFrame;
    capturedOutput!(frame);

    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });

    expect(drawImage).toHaveBeenCalled();
    replayer.dispose();
  });
});
