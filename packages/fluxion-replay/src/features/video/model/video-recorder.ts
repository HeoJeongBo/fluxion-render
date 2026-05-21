import type { VideoFrameInfo } from "../../../entities/video-channel/video-channel";
import type { ReplayRecorder } from "../../recorder/model/replay-recorder";
import type { ReplayStore } from "../../store/model/replay-store";
import type { ThumbnailStore } from "../../timeline/model/thumbnail-store";

export interface VideoRecorderOptions {
  channelId: string;
  store: ReplayStore;
  recorder: ReplayRecorder;
  thumbnailStore?: ThumbnailStore;
  keyframeIntervalSec?: number;
  codec?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  framerate?: number;
}

const DEFAULT_KEYFRAME_INTERVAL_SEC = 2;
const DEFAULT_CODEC = "vp8";
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
const DEFAULT_BITRATE = 1_000_000;
const DEFAULT_FRAMERATE = 30;

export class VideoRecorder {
  private readonly _channelId: string;
  private readonly _store: ReplayStore;
  private readonly _recorder: ReplayRecorder;
  private readonly _thumbnailStore: ThumbnailStore | undefined;
  private readonly _keyframeIntervalSec: number;
  private readonly _config: VideoEncoderConfig;
  private _encoder: VideoEncoder | null = null;
  private _processor: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private _frameCount = 0;
  private _running = false;
  private _startWallMs = 0;
  private _startVideoUs = 0;

  constructor(opts: VideoRecorderOptions) {
    this._channelId = opts.channelId;
    this._store = opts.store;
    this._recorder = opts.recorder;
    this._thumbnailStore = opts.thumbnailStore;
    this._keyframeIntervalSec = opts.keyframeIntervalSec ?? DEFAULT_KEYFRAME_INTERVAL_SEC;
    this._config = {
      codec: opts.codec ?? DEFAULT_CODEC,
      width: opts.width ?? DEFAULT_WIDTH,
      height: opts.height ?? DEFAULT_HEIGHT,
      bitrate: opts.bitrate ?? DEFAULT_BITRATE,
      framerate: opts.framerate ?? DEFAULT_FRAMERATE,
    };
  }

  get isRunning(): boolean {
    return this._running;
  }

  async start(track: MediaStreamTrack): Promise<void> {
    if (this._running) return;

    // Progressive enhancement: WebCodecs may not be available
    if (typeof VideoEncoder === "undefined") {
      console.warn("[VideoRecorder] WebCodecs (VideoEncoder) is not supported in this browser.");
      this._startFallback(track);
      return;
    }

    if (typeof MediaStreamTrackProcessor === "undefined") {
      console.warn("[VideoRecorder] MediaStreamTrackProcessor is not supported. Falling back.");
      this._startFallback(track);
      return;
    }

    this._running = true;
    this._startWallMs = Date.now();
    this._startVideoUs = -1; // set on first frame
    this._setupEncoder();

    const processor = new MediaStreamTrackProcessor({ track } as MediaStreamTrackProcessorInit);
    const reader = (processor.readable as ReadableStream<VideoFrame>).getReader();
    this._processor = reader;

    void this._readLoop(reader);
  }

  stop(): void {
    this._running = false;
    this._processor?.cancel().catch(() => {});
    this._processor = null;
    this._encoder?.close();
    this._encoder = null;
    this._frameCount = 0;
    this._startWallMs = 0;
    this._startVideoUs = 0;
  }

  private _setupEncoder(): void {
    this._encoder = new VideoEncoder({
      output: (chunk, _meta) => {
        void this._onEncodedChunk(chunk);
      },
      error: (e) => {
        console.error("[VideoRecorder] VideoEncoder error:", e);
      },
    });
    this._encoder.configure(this._config);
  }

  private async _readLoop(reader: ReadableStreamDefaultReader<VideoFrame>): Promise<void> {
    const keyframeEvery = Math.round(
      (this._config.framerate ?? DEFAULT_FRAMERATE) * this._keyframeIntervalSec,
    );

    while (this._running) {
      let result: ReadableStreamReadResult<VideoFrame>;
      try {
        result = await reader.read();
      } catch {
        break;
      }
      if (result.done) break;

      const frame = result.value;
      if (this._startVideoUs < 0) this._startVideoUs = frame.timestamp;
      const isKeyframe = this._frameCount % keyframeEvery === 0;

      this._encoder?.encode(frame, { keyFrame: isKeyframe });
      frame.close();
      this._frameCount++;
    }
  }

  private async _onEncodedChunk(chunk: EncodedVideoChunk): Promise<void> {
    const isKeyframe = chunk.type === "key";
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);

    const offsetUs = chunk.timestamp - this._startVideoUs;
    const tMs = this._startWallMs + Math.round(offsetUs / 1000);
    const filename = `${tMs}.chunk`;

    await this._store.writeVideoChunk(this._channelId, filename, data);

    const frameInfo: VideoFrameInfo = {
      opfsPath: `video/${this._channelId}/${filename}`,
      isKeyframe,
      durationUs: chunk.duration ?? 0,
      byteLength: data.byteLength,
    };

    this._recorder.record(this._channelId, frameInfo, tMs);
  }

  private _startFallback(_track: MediaStreamTrack): void {
    // Degraded mode: no video recording without WebCodecs
    this._running = true;
    console.warn("[VideoRecorder] Running in no-op fallback mode (no frames captured).");
  }
}
