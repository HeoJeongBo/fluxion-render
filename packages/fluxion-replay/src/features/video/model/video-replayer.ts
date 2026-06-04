import type { VideoFrameInfo } from "../../../entities/video-channel/video-channel";
import type { ReplayPlayerFrame } from "../../player/model/replay-player";
import type { ReplayStore } from "../../store/model/replay-store";
import type { TimelineIndex } from "../../timeline/model/timeline-index";

export interface VideoDecoderConfig {
  codec: string;
}

export interface VideoReplayerOptions {
  store: ReplayStore;
  channelId: string;
  outputCanvas: HTMLCanvasElement | OffscreenCanvas;
  decoderConfig?: VideoDecoderConfig;
}

const DEFAULT_CODEC = "vp8";

export class VideoReplayer {
  private readonly _store: ReplayStore;
  private readonly _channelId: string;
  private readonly _canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly _codec: string;
  private _decoder: VideoDecoder | null = null;
  private _lastFrame: VideoFrame | null = null;
  private _canvasInitialized = false;

  constructor(opts: VideoReplayerOptions) {
    this._store = opts.store;
    this._channelId = opts.channelId;
    this._canvas = opts.outputCanvas;
    this._codec = opts.decoderConfig?.codec ?? DEFAULT_CODEC;
  }

  /** Feed a single frame from the ReplayPlayer onFrame event. */
  feedFrame(frame: ReplayPlayerFrame): void {
    if (typeof VideoDecoder === "undefined") return;
    if (frame.channelId !== this._channelId) return;

    const info = frame.data as VideoFrameInfo;
    void this._decodeChunk(info, info.isKeyframe);
  }

  /** Seek to a specific time, re-decoding from the last keyframe. */
  async seekTo(
    t: number,
    keyframeIndex: TimelineIndex,
    allFrames: ReplayPlayerFrame[],
  ): Promise<void> {
    if (typeof VideoDecoder === "undefined") return;

    const keyframeT = keyframeIndex.floor(t);
    if (keyframeT === null) return;

    this._resetDecoder();

    const framesToDecode = allFrames.filter(
      (f) => f.channelId === this._channelId && f.t >= keyframeT && f.t <= t,
    );

    for (const f of framesToDecode) {
      const info = f.data as VideoFrameInfo;
      await this._decodeChunk(info, info.isKeyframe);
    }
  }

  dispose(): void {
    this._lastFrame?.close();
    this._lastFrame = null;
    this._decoder?.close();
    this._decoder = null;
  }

  private _resetDecoder(): void {
    if (this._decoder) {
      try {
        this._decoder.close();
      } catch {
        /* already closed */
      }
      this._decoder = null;
    }
    this._lastFrame?.close();
    this._lastFrame = null;
    this._canvasInitialized = false;
  }

  private _setupDecoder(): void {
    if (typeof VideoDecoder === "undefined") return;

    this._decoder = new VideoDecoder({
      output: (frame) => {
        this._lastFrame?.close();
        this._lastFrame = frame;
        this._renderFrame(frame);
      },
      error: (e) => {
        console.error("[VideoReplayer] VideoDecoder error:", e);
      },
    });
    // configure is deferred to first keyframe — dimensions come from VideoFrameInfo
  }

  private async _decodeChunk(info: VideoFrameInfo, isKeyframe: boolean): Promise<void> {
    if (!this._decoder) this._setupDecoder();
    if (!this._decoder) return;

    // Decoder must be configured before any chunk. Configure on first keyframe using
    // the actual encoded dimensions stored in VideoFrameInfo — this avoids the
    // hardcoded-resolution mismatch that corrupts VP8 decode on Retina displays.
    if (this._decoder.state === "unconfigured") {
      if (!isKeyframe) return;
      if (!this._canvasInitialized) {
        this._canvas.width = info.codedWidth;
        this._canvas.height = info.codedHeight;
        this._canvasInitialized = true;
      }
      this._decoder.configure({
        codec: this._codec,
        codedWidth: info.codedWidth,
        codedHeight: info.codedHeight,
      });
    }

    const channelId = this._channelId;
    const filename = info.opfsPath.split("/").pop() ?? "";
    const data = await this._store.readVideoChunk(channelId, filename);
    if (!data) return;

    // Re-check after async gap — decoder may have been closed/disposed
    if (!this._decoder || this._decoder.state !== "configured") return;

    const chunk = new EncodedVideoChunk({
      type: isKeyframe ? "key" : "delta",
      timestamp: 0,
      data: data.buffer as ArrayBuffer,
    });

    this._decoder.decode(chunk);
  }

  private _renderFrame(frame: VideoFrame): void {
    const ctx = this._canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return;
    // Don't close here — ownership stays with `_lastFrame`, which the `output`
    // callback closes when the next frame arrives (and `_resetDecoder`/`dispose`
    // close on teardown). Closing here too would double-close every frame.
    ctx.drawImage(
      frame as unknown as CanvasImageSource,
      0,
      0,
      this._canvas.width,
      this._canvas.height,
    );
  }
}
