import type { VideoFrameInfo } from "../../../entities/video-channel/video-channel";
import type { ReplayPlayerFrame } from "../../player/model/replay-player";
import type { ReplayStore } from "../../store/model/replay-store";
import type { TimelineIndex } from "../../timeline/model/timeline-index";

export interface VideoDecoderConfig {
  codec: string;
  codedWidth: number;
  codedHeight: number;
}

export interface VideoReplayerOptions {
  store: ReplayStore;
  channelId: string;
  outputCanvas: HTMLCanvasElement | OffscreenCanvas;
  decoderConfig?: VideoDecoderConfig;
}

const DEFAULT_DECODER_CONFIG: VideoDecoderConfig = {
  codec: "vp8",
  codedWidth: 640,
  codedHeight: 480,
};

export class VideoReplayer {
  private readonly _store: ReplayStore;
  private readonly _channelId: string;
  private readonly _canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly _decoderConfig: VideoDecoderConfig;
  private _decoder: VideoDecoder | null = null;
  private _lastFrame: VideoFrame | null = null;
  private _seenKeyframe = false;

  constructor(opts: VideoReplayerOptions) {
    this._store = opts.store;
    this._channelId = opts.channelId;
    this._canvas = opts.outputCanvas;
    this._decoderConfig = opts.decoderConfig ?? DEFAULT_DECODER_CONFIG;
  }

  /** Feed a single frame from the ReplayPlayer onFrame event. */
  feedFrame(frame: ReplayPlayerFrame): void {
    if (typeof VideoDecoder === "undefined") return;
    if (frame.channelId !== this._channelId) return;

    const info = frame.data as VideoFrameInfo;

    // Drop delta frames until a keyframe arrives — prevents decoder corruption
    if (!info.isKeyframe && !this._seenKeyframe) return;
    if (info.isKeyframe) this._seenKeyframe = true;

    void this._decodeChunk(info, info.isKeyframe);
  }

  /** Seek to a specific time, re-decoding from the last keyframe. */
  async seekTo(t: number, keyframeIndex: TimelineIndex, allFrames: ReplayPlayerFrame[]): Promise<void> {
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
    this._seenKeyframe = false;
    if (this._decoder) {
      try { this._decoder.close(); } catch { /* already closed */ }
      this._decoder = null;
    }
    this._lastFrame?.close();
    this._lastFrame = null;
    this._setupDecoder();
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

    this._decoder.configure({
      codec: this._decoderConfig.codec,
      codedWidth: this._decoderConfig.codedWidth,
      codedHeight: this._decoderConfig.codedHeight,
    });
  }

  private async _decodeChunk(info: VideoFrameInfo, isKeyframe: boolean): Promise<void> {
    if (!this._decoder) this._setupDecoder();
    if (!this._decoder) return;

    const channelId = this._channelId;
    const filename = info.opfsPath.split("/").pop() ?? "";
    const data = await this._store.readVideoChunk(channelId, filename);
    if (!data) return;

    // Re-check after async gap — decoder may have been closed/disposed or not yet configured
    if (!this._decoder || this._decoder.state !== "configured") return;

    const chunk = new EncodedVideoChunk({
      type: isKeyframe ? "key" : "delta",
      timestamp: 0,
      data: data.buffer as ArrayBuffer,
    });

    this._decoder.decode(chunk);
  }

  private _renderFrame(frame: VideoFrame): void {
    const ctx = this._canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return;
    ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0);
    frame.close();
  }
}
