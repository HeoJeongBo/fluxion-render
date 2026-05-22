import type { BaseChannel } from "../../../shared/model/base-channel";
import { ReplayPlayer } from "../../player/model/replay-player";
import { ReplayRecorder } from "../../recorder/model/replay-recorder";
import { ReplayStore, type ReplayStoreOptions, type StorageInfo } from "../../store/model/replay-store";

export type ReplaySessionMode = "live" | "replay";

export interface ReplaySessionOptions {
  channels: BaseChannel<unknown>[];
  retentionMs?: number;
  memoryCapacity?: number;
  indexIntervalMs?: number;
  storeOptions?: ReplayStoreOptions;
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
    this._recorder.start();
  }

  stopRecording(): void {
    this._recorder.stop();
  }

  record<T>(channelId: string, data: T, timestamp?: number): void {
    this._recorder.record(channelId, data, timestamp);
  }

  async enterReplay(timestamp?: number): Promise<ReplayPlayer> {
    this._player?.dispose();

    const timeRange = await this._store.getTimeRange();
    const range = timeRange ?? {
      earliest: Date.now() - (10 * 60 * 1000),
      latest: Date.now(),
    };

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
