import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayStore } from "../../store/model/replay-store";
import { VideoReplayer } from "./video-replayer";

function makeCanvas(): HTMLCanvasElement {
  const canvas = { getContext: () => ({ drawImage: vi.fn() }), width: 640, height: 480 } as unknown as HTMLCanvasElement;
  return canvas;
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
          codedWidth: 640,
          codedHeight: 480,
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
        data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
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
      data: { opfsPath: "video/cam/x.chunk", isKeyframe: true, durationUs: 0, byteLength: 0, codedWidth: 640, codedHeight: 480 },
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
        data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
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
    const canvas = { getContext: () => ({ drawImage }), width: 640, height: 480 } as unknown as HTMLCanvasElement;

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
      data: { opfsPath: "video/cam/1000.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 1000,
    });

    // Flush async OPFS read in _decodeChunk
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // Now manually fire the output callback to exercise _renderFrame
    const frame = { timestamp: 0, duration: null, displayWidth: 640, displayHeight: 480, close: () => {} } as unknown as VideoFrame;
    capturedOutput!(frame);

    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });

    expect(drawImage).toHaveBeenCalled();
    replayer.dispose();
  });

  it("configures decoder with dimensions from first keyframe's VideoFrameInfo", async () => {
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));

    const origVideoDecoder = globalThis.VideoDecoder;
    let capturedConfig: unknown = null;
    class SpyDecoder {
      state = "unconfigured";
      constructor(_init: unknown) {}
      configure(config: unknown) { capturedConfig = config; this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: SpyDecoder, writable: true, configurable: true,
    });

    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 1920, codedHeight: 1080 },
      t: 0,
    });

    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(capturedConfig).toMatchObject({ codedWidth: 1920, codedHeight: 1080 });

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("skips delta frame before first keyframe (unconfigured state)", async () => {
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));
    await store.writeVideoChunk("cam", "33.chunk", new Uint8Array([4, 5, 6]));

    const origVideoDecoder = globalThis.VideoDecoder;
    const configureCallArgs: unknown[] = [];
    const decodeCallCount = { count: 0 };
    class SpyDecoder {
      state = "unconfigured";
      constructor(_init: unknown) {}
      configure(config: unknown) { configureCallArgs.push(config); this.state = "configured"; }
      decode(_chunk: unknown) { decodeCallCount.count++; }
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: SpyDecoder, writable: true, configurable: true,
    });

    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: makeCanvas() });

    // Send delta frame first — should be skipped entirely
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: false, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 0,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(configureCallArgs).toHaveLength(0);
    expect(decodeCallCount.count).toBe(0);

    // Now send keyframe — should configure and decode
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/33.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 33,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(configureCallArgs).toHaveLength(1);
    expect(decodeCallCount.count).toBe(1);

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("canvas is initialized with codedWidth/codedHeight from first keyframe", async () => {
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));

    const origVideoDecoder = globalThis.VideoDecoder;
    class SpyDecoder {
      state = "unconfigured";
      constructor(_init: unknown) {}
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: SpyDecoder, writable: true, configurable: true,
    });

    const canvas = { getContext: () => ({ drawImage: vi.fn() }), width: 640, height: 480 } as unknown as HTMLCanvasElement;
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 1920, codedHeight: 1080 },
      t: 0,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect((canvas as unknown as { width: number }).width).toBe(1920);
    expect((canvas as unknown as { height: number }).height).toBe(1080);

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("canvas is NOT resized on subsequent delta frames", async () => {
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));
    await store.writeVideoChunk("cam", "33.chunk", new Uint8Array([4, 5, 6]));

    const origVideoDecoder = globalThis.VideoDecoder;
    class SpyDecoder {
      state = "unconfigured";
      constructor(_init: unknown) {}
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: SpyDecoder, writable: true, configurable: true,
    });

    const canvas = { getContext: () => ({ drawImage: vi.fn() }), width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });

    // First keyframe — canvas should be set to codedWidth/Height
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 0,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect((canvas as unknown as { width: number }).width).toBe(640);

    // Delta frame — canvas size must not change
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/33.chunk", isKeyframe: false, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 33,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect((canvas as unknown as { width: number }).width).toBe(640);
    expect((canvas as unknown as { height: number }).height).toBe(480);

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("canvas is re-initialized after seekTo resets the decoder", async () => {
    const { TimelineIndex } = await import("../../timeline/model/timeline-index");
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));
    await store.writeVideoChunk("cam", "5000.chunk", new Uint8Array([4, 5, 6]));

    const origVideoDecoder = globalThis.VideoDecoder;
    class SpyDecoder {
      state = "unconfigured";
      constructor(_init: unknown) {}
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: SpyDecoder, writable: true, configurable: true,
    });

    const canvas = { getContext: () => ({ drawImage: vi.fn() }), width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });

    // First keyframe at t=0 with 640×480
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 0,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect((canvas as unknown as { width: number }).width).toBe(640);

    // seekTo resets _canvasInitialized — next keyframe should re-initialize canvas
    const idx = new TimelineIndex();
    idx.insert(5000);
    const frames = [{
      channelId: "cam",
      data: { opfsPath: "video/cam/5000.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 1920, codedHeight: 1080 },
      t: 5000,
    }];
    await replayer.seekTo(5000, idx, frames);
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect((canvas as unknown as { width: number }).width).toBe(1920);
    expect((canvas as unknown as { height: number }).height).toBe(1080);

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("_renderFrame is a no-op when getContext returns null (ctx=null branch)", async () => {
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));

    const origVideoDecoder = globalThis.VideoDecoder;
    let capturedOutput: ((frame: VideoFrame) => void) | null = null;
    class CapturingDecoder {
      state = "unconfigured";
      constructor(init: { output: (frame: VideoFrame) => void; error: unknown }) {
        capturedOutput = init.output;
      }
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: CapturingDecoder, writable: true, configurable: true,
    });

    // Canvas whose getContext returns null — covers the `if (!ctx) return;` branch
    const canvas = { getContext: () => null, width: 640, height: 480 } as unknown as HTMLCanvasElement;
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 640, codedHeight: 480 },
      t: 0,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    const frame = { timestamp: 0, duration: null, displayWidth: 640, displayHeight: 480, close: vi.fn() } as unknown as VideoFrame;
    // Must not throw even though ctx is null
    expect(() => capturedOutput!(frame)).not.toThrow();
    // close() should NOT have been called because we returned early
    expect((frame as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });

  it("_renderFrame draws into canvas at canvas dimensions without resizing", async () => {
    await store.writeVideoChunk("cam", "0.chunk", new Uint8Array([1, 2, 3]));

    const origVideoDecoder = globalThis.VideoDecoder;
    let capturedOutput: ((frame: VideoFrame) => void) | null = null;
    class CapturingDecoder {
      state = "unconfigured";
      constructor(init: { output: (frame: VideoFrame) => void; error: unknown }) {
        capturedOutput = init.output;
      }
      configure(_config: unknown) { this.state = "configured"; }
      decode(_chunk: unknown) {}
      async flush() {}
      close() { this.state = "closed"; }
    }
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: CapturingDecoder, writable: true, configurable: true,
    });

    const drawImage = vi.fn();
    const canvas = { getContext: () => ({ drawImage }), width: 640, height: 480 } as unknown as HTMLCanvasElement;
    const replayer = new VideoReplayer({ store, channelId: "cam", outputCanvas: canvas });
    replayer.feedFrame({
      channelId: "cam",
      data: { opfsPath: "video/cam/0.chunk", isKeyframe: true, durationUs: 33333, byteLength: 3, codedWidth: 1920, codedHeight: 1080 },
      t: 0,
    });
    for (let i = 0; i < 10; i++) await Promise.resolve();

    // Manually fire output callback to exercise _renderFrame
    const frame = { timestamp: 0, duration: null, displayWidth: 1920, displayHeight: 1080, close: () => {} } as unknown as VideoFrame;
    capturedOutput!(frame);

    // canvas.width was set by _decodeChunk to 1920; _renderFrame draws using that
    expect(drawImage).toHaveBeenCalledWith(frame, 0, 0, 1920, 1080);

    replayer.dispose();
    Object.defineProperty(globalThis, "VideoDecoder", {
      value: origVideoDecoder, writable: true, configurable: true,
    });
  });
});
