import type { BaseChannel } from "../../../shared/model/base-channel";
import { ReplayPlayer } from "../../player/model/replay-player";
import { ReplayRecorder } from "../../recorder/model/replay-recorder";
import type { RecordingSegment } from "../../store/model/replay-store";
import { ReplayStore, type ReplayStoreOptions, type StorageInfo } from "../../store/model/replay-store";

export type ReplaySessionMode = "live" | "replay";

export interface ReplaySessionOptions {
  channels: BaseChannel<unknown>[];
  retentionMs?: number;
  memoryCapacity?: number;
  indexIntervalMs?: number;
  storeOptions?: ReplayStoreOptions;
  /**
   * Storage usage percentage (0–100) at which old IDB frames are automatically
   * evicted after each flush. Set to 100 or above to disable. Default: 60.
   */
  evictThresholdPct?: number;
  /**
   * Interval in milliseconds at which current storage usage is logged to
   * `console.log`. Set to 0 to disable. Default: 0.
   */
  storageLogIntervalMs?: number;
}

export class ReplaySession {
  private readonly _store: ReplayStore;
  private readonly _recorder: ReplayRecorder;
  private readonly _channelMap: Map<string, BaseChannel<unknown>>;
  private _player: ReplayPlayer | null = null;
  private _mode: ReplaySessionMode = "live";

  constructor(opts: ReplaySessionOptions) {
    this._store = new ReplayStore({
      retentionMs: opts.retentionMs,
      evictThresholdPct: opts.evictThresholdPct,
      storageLogIntervalMs: opts.storageLogIntervalMs,
      ...opts.storeOptions,
    });

    this._channelMap = new Map(opts.channels.map((ch) => [ch.channelId, ch]));

    this._recorder = new ReplayRecorder({
      channels: opts.channels,
      store: this._store,
      retentionMs: opts.retentionMs,
      memoryCapacity: opts.memoryCapacity,
      indexIntervalMs: opts.indexIntervalMs,
    });
  }

  async open(): Promise<void> {
    await this._store.open();
  }

  async startRecording(): Promise<void> {
    this._store.startSegment();
    this._recorder.start();
  }

  stopRecording(): void {
    this._store.endSegment();
    this._recorder.stop();
  }

  record<T>(channelId: string, data: T, timestamp?: number): void {
    this._recorder.record(channelId, data, timestamp);
  }

  async enterReplay(
    timestamp?: number,
    opts?: { timeRange?: { earliest: number; latest: number } },
  ): Promise<ReplayPlayer> {
    this._player?.dispose();

    // Commit the recorder's pending batch before anyone reads the IDB time
    // range — otherwise the last ~500ms of frames (still in the in-memory
    // queue) are invisible to both `getTimeRange()` and the player's
    // prefetch, leaving a tail gap right where the user just entered.
    await this._store.flush();

    const idbRange = await this._store.getTimeRange();
    const fallback = idbRange ?? {
      earliest: Date.now() - (10 * 60 * 1000),
      latest: Date.now(),
    };

    let range: { earliest: number; latest: number };
    // Only honour caller-supplied bounds when they describe a real interval.
    // A zero-width or inverted range (e.g. a freshly-seeded liveTimeRange
    // before the first poll) collapses the player to its start point —
    // onEnd fires on the first tick. Fall back to the IDB range instead.
    if (opts?.timeRange && opts.timeRange.latest > opts.timeRange.earliest) {
      const clamped = idbRange
        ? {
            earliest: Math.max(opts.timeRange.earliest, idbRange.earliest),
            latest: Math.min(opts.timeRange.latest, idbRange.latest),
          }
        : opts.timeRange;
      // Belt-and-suspenders: if the intersection collapsed (caller's range
      // doesn't overlap what IDB actually has), fall back to IDB so the
      // player has something to play.
      range = clamped.latest > clamped.earliest ? clamped : fallback;
    } else {
      range = fallback;
    }

    this._player = new ReplayPlayer({
      store: this._store,
      channels: this._channelMap,
      timeRange: range,
    });

    if (timestamp !== undefined) {
      this._player.seek(timestamp);
    }

    this._mode = "replay";
    return this._player;
  }

  exitReplay(): void {
    this._player?.dispose();
    this._player = null;
    this._mode = "live";
  }

  getSegments(): readonly RecordingSegment[] {
    return this._store.getSegments();
  }

  async getTimeRange(): Promise<{ earliest: number; latest: number } | null> {
    return this._store.getTimeRange();
  }

  getStorageInfo(): Promise<StorageInfo> {
    return this._store.getStorageInfo();
  }

  async clearRecording(): Promise<void> {
    this._recorder.stop();
    await this._store.clearAll();
    this._recorder.start();
  }

  get mode(): ReplaySessionMode {
    return this._mode;
  }

  get player(): ReplayPlayer | null {
    return this._player;
  }

  get store(): ReplayStore {
    return this._store;
  }

  get recorder(): ReplayRecorder {
    return this._recorder;
  }

  dispose(): void {
    this._player?.dispose();
    this._player = null;
    this._recorder.stop();
    this._store.dispose();
  }
}
