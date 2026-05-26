import type { BaseChannel } from "../../../shared/model/base-channel";
import type { SerializedFrame } from "../../../shared/model/frame";

/**
 * Result of a typed `getFramesByChannel(channel, ...)` query. The payload
 * has already been decoded by the channel, so consumers don't have to
 * `channel.decode(payload) as T` themselves.
 */
export interface DecodedFrame<T> {
  t: number;
  channelId: string;
  data: T;
}

export interface ReplayStoreOptions {
  dbName?: string;
  dbVersion?: number;
  retentionMs?: number;
  batchIntervalMs?: number;
  /**
   * Storage usage percentage (0–100) at which old frames are automatically
   * evicted. When `percentUsed` exceeds this value after each flush, the
   * oldest 10 % of the recorded time span is deleted from IDB.
   * Set to 100 (or above) to disable automatic eviction. Default: 60.
   */
  evictThresholdPct?: number;
  /**
   * Interval in milliseconds at which current storage usage is logged to
   * `console.log`. Set to 0 to disable. Default: 0.
   */
  storageLogIntervalMs?: number;
}

export interface StorageInfo {
  /** Total bytes used by this origin (IDB + OPFS + all storage). */
  usedBytes: number;
  /** Storage quota for this origin in bytes. */
  quotaBytes: number;
  /** Percentage of quota used (0–100). */
  percentUsed: number;
  /** Number of frame records currently in IndexedDB. */
  idbFrameCount: number;
}

export interface RecordingSegment {
  /** Segment start timestamp (ms since epoch). */
  start: number;
  /** Segment end timestamp (ms since epoch). null = currently recording. */
  end: number | null;
}

const DEFAULT_DB_NAME = "fluxion-replay";
const DEFAULT_DB_VERSION = 1;
const DEFAULT_RETENTION_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_INTERVAL_MS = 500;

interface FrameRecord {
  t: number;
  channelId: string;
  payload: ArrayBuffer;
}

export class ReplayStore {
  private _db: IDBDatabase | null = null;
  private _opfsRoot: FileSystemDirectoryHandle | null = null;
  private _pending: FrameRecord[] = [];
  private _flushTimer: ReturnType<typeof setInterval> | null = null;
  private _retentionMs: number;
  private _batchIntervalMs: number;
  private _dbName: string;
  private _dbVersion: number;
  private _segments: RecordingSegment[] = [];
  private _evictThresholdPct: number;
  private _storageLogIntervalMs: number;
  private _storageLogTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: ReplayStoreOptions) {
    this._dbName = opts?.dbName ?? DEFAULT_DB_NAME;
    this._dbVersion = opts?.dbVersion ?? DEFAULT_DB_VERSION;
    this._retentionMs = opts?.retentionMs ?? DEFAULT_RETENTION_MS;
    this._batchIntervalMs = opts?.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
    this._evictThresholdPct = opts?.evictThresholdPct ?? 60;
    this._storageLogIntervalMs = opts?.storageLogIntervalMs ?? 0;
  }

  async open(): Promise<void> {
    this._db = await this._openIDB();
    try {
      this._opfsRoot = await navigator.storage.getDirectory();
    } catch {
      // OPFS not available (e.g. non-secure context) — video recording disabled
      this._opfsRoot = null;
    }
    this._startFlushTimer();
    if (this._storageLogIntervalMs > 0) {
      this._startStorageLogTimer();
    }
  }

  appendFrame(frame: SerializedFrame): void {
    this._pending.push({ t: frame.t, channelId: frame.channelId, payload: frame.payload });
  }

  async flush(): Promise<void> {
    await this._flushPending();
  }

  async getFrames(fromMs: number, toMs: number): Promise<SerializedFrame[]> {
    const db = this._assertOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("frames", "readonly");
      const index = tx.objectStore("frames").index("by_t");
      const range = IDBKeyRange.bound(fromMs, toMs);
      const req = index.getAll(range);
      req.onsuccess = (e) => {
        const records = (e.target as IDBRequest<FrameRecord[]>).result;
        resolve(
          records.map((r) => ({
            t: r.t,
            channelId: r.channelId,
            payload: r.payload,
          })),
        );
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Range query scoped to a single channel. Uses the composite `by_channel_t`
   * index so IDB streams only the matching channel's frames — much cheaper
   * than `getFrames(...).filter(...)` once the store has many channels.
   *
   * Returned frames are sorted ascending by `t`.
   *
   * Two call forms:
   *
   * - `getFramesByChannel(channelId, from, to)` — returns raw
   *   `SerializedFrame[]`. Callers decode payloads themselves.
   * - `getFramesByChannel(channel, from, to)` — passes the `BaseChannel`
   *   instance; the store decodes every payload up-front and returns
   *   typed `DecodedFrame<T>[]`. Removes the `channel.decode(payload) as T`
   *   cast from consumer code.
   */
  getFramesByChannel(
    channelId: string,
    fromMs: number,
    toMs: number,
  ): Promise<SerializedFrame[]>;
  getFramesByChannel<T>(
    channel: BaseChannel<T>,
    fromMs: number,
    toMs: number,
  ): Promise<DecodedFrame<T>[]>;
  async getFramesByChannel<T>(
    channelOrId: string | BaseChannel<T>,
    fromMs: number,
    toMs: number,
  ): Promise<SerializedFrame[] | DecodedFrame<T>[]> {
    const channelId =
      typeof channelOrId === "string" ? channelOrId : channelOrId.channelId;
    const db = this._assertOpen();
    const raw = await new Promise<SerializedFrame[]>((resolve, reject) => {
      const tx = db.transaction("frames", "readonly");
      const index = tx.objectStore("frames").index("by_channel_t");
      const range = IDBKeyRange.bound([channelId, fromMs], [channelId, toMs]);
      const req = index.getAll(range);
      req.onsuccess = (e) => {
        const records = (e.target as IDBRequest<FrameRecord[]>).result;
        resolve(
          records.map((r) => ({
            t: r.t,
            channelId: r.channelId,
            payload: r.payload,
          })),
        );
      };
      req.onerror = () => reject(req.error);
    });
    if (typeof channelOrId === "string") return raw;
    return raw.map((f) => ({
      t: f.t,
      channelId: f.channelId,
      data: channelOrId.decode(f.payload),
    }));
  }

  async deleteFramesBefore(cutoffMs: number): Promise<void> {
    const db = this._assertOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("frames", "readwrite");
      const index = tx.objectStore("frames").index("by_t");
      const range = IDBKeyRange.upperBound(cutoffMs, true);
      const req = index.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          resolve();
          return;
        }
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getStorageInfo(): Promise<StorageInfo> {
    const est = await navigator.storage.estimate();
    const used = est.usage ?? 0;
    const quota = est.quota ?? 0;
    const count = this._db ? await this._countFrames() : 0;
    return {
      usedBytes: used,
      quotaBytes: quota,
      percentUsed: quota > 0 ? (used / quota) * 100 : 0,
      idbFrameCount: count,
    };
  }

  startSegment(t = Date.now()): void {
    // Close any open segment first
    if (this._segments.length > 0 && this._segments[this._segments.length - 1].end === null) {
      this._segments[this._segments.length - 1].end = t;
    }
    this._segments.push({ start: t, end: null });
  }

  endSegment(t = Date.now()): void {
    if (this._segments.length > 0 && this._segments[this._segments.length - 1].end === null) {
      this._segments[this._segments.length - 1].end = t;
    }
  }

  getSegments(): RecordingSegment[] {
    return this._segments;
  }

  async getTimeRange(): Promise<{ earliest: number; latest: number } | null> {
    if (!this._db) return null;
    const earliest = await this._querySingleT("next");
    if (earliest === null) return null;
    const latest = await this._querySingleT("prev");
    return { earliest, latest: latest ?? earliest };
  }

  private _countFrames(): Promise<number> {
    const db = this._assertOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("frames", "readonly");
      const req = tx.objectStore("frames").count();
      req.onsuccess = (e) => resolve((e.target as IDBRequest<number>).result);
      req.onerror = () => reject(req.error);
    });
  }

  private _querySingleT(direction: IDBCursorDirection): Promise<number | null> {
    const db = this._assertOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("frames", "readonly");
      const index = tx.objectStore("frames").index("by_t");
      const req = index.openCursor(null, direction);
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
        resolve(cursor ? (cursor.value as FrameRecord).t : null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async writeVideoChunk(channelId: string, filename: string, data: Uint8Array): Promise<void> {
    const root = this._assertOpfs();
    const dir = await root.getDirectoryHandle(channelId, { create: true });
    const file = await dir.getFileHandle(filename, { create: true });
    const writable = await file.createWritable();
    await writable.write(data as unknown as FileSystemWriteChunkType);
    await writable.close();
  }

  async readVideoChunk(channelId: string, filename: string): Promise<Uint8Array | null> {
    const root = this._opfsRoot;
    if (!root) return null;
    try {
      const dir = await root.getDirectoryHandle(channelId);
      const file = await dir.getFileHandle(filename);
      const f = await file.getFile();
      const buf = await f.arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async clearAll(): Promise<void> {
    this._segments = [];
    // Clear IDB frames
    const db = this._assertOpen();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("frames", "readwrite");
      const req = tx.objectStore("frames").clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Clear OPFS video chunks
    const root = this._opfsRoot;
    if (!root) return;
    try {
      const names: string[] = [];
      for await (const [name] of (root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        names.push(name);
      }
      await Promise.all(names.map((n) => root.removeEntry(n, { recursive: true }).catch(() => {})));
    } catch {
      // OPFS iteration not supported in all environments — skip silently
    }
  }

  async deleteVideoChunk(channelId: string, filename: string): Promise<void> {
    const root = this._opfsRoot;
    if (!root) return;
    try {
      const dir = await root.getDirectoryHandle(channelId);
      await dir.removeEntry(filename);
    } catch {
      // Already deleted or never existed
    }
  }

  dispose(): void {
    this._stopFlushTimer();
    this._stopStorageLogTimer();
    this._db?.close();
    this._db = null;
    this._opfsRoot = null;
    this._pending = [];
  }

  private _assertOpen(): IDBDatabase {
    if (!this._db) throw new Error(`ReplayStore("${this._dbName}") is not open. Call open() first.`);
    return this._db;
  }

  private _assertOpfs(): FileSystemDirectoryHandle {
    if (!this._opfsRoot) throw new Error("OPFS is not available in this context.");
    return this._opfsRoot;
  }

  private _startFlushTimer(): void {
    this._flushTimer = setInterval(() => {
      void this._flushPending();
    }, this._batchIntervalMs);
  }

  private _stopFlushTimer(): void {
    if (this._flushTimer != null) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  private async _flushPending(): Promise<void> {
    if (this._pending.length === 0 || !this._db) return;
    const batch = this._pending.splice(0, this._pending.length);
    await this._writeBatch(batch);
    await this._maybeEvict();
  }

  private async _maybeEvict(): Promise<void> {
    if (this._evictThresholdPct >= 100) return;
    try {
      const info = await this.getStorageInfo();
      if (info.percentUsed < this._evictThresholdPct) return;

      const timeRange = await this.getTimeRange();
      if (!timeRange) return;

      const spanMs = timeRange.latest - timeRange.earliest;
      if (spanMs <= 0) return;

      // Delete the oldest 10 % of the recorded time span
      const cutoffMs = timeRange.earliest + Math.floor(spanMs * 0.1);
      await this.deleteFramesBefore(cutoffMs);
    } catch {
      // eviction failure must not crash the flush pipeline
    }
  }

  private _startStorageLogTimer(): void {
    this._storageLogTimer = setInterval(async () => {
      try {
        const info = await this.getStorageInfo();
        console.log(
          `[ReplayStore "${this._dbName}"] storage: ${info.percentUsed.toFixed(1)}% used` +
          ` (${(info.usedBytes / 1024 / 1024).toFixed(1)} MB / ${(info.quotaBytes / 1024 / 1024).toFixed(1)} MB),` +
          ` ${info.idbFrameCount} frames`,
        );
      } catch {
        // ignore
      }
    }, this._storageLogIntervalMs);
  }

  private _stopStorageLogTimer(): void {
    if (this._storageLogTimer != null) {
      clearInterval(this._storageLogTimer);
      this._storageLogTimer = null;
    }
  }

  private async _writeBatch(records: FrameRecord[]): Promise<void> {
    const db = this._db;
    if (!db) return;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("frames", "readwrite");
      const store = tx.objectStore("frames");
      for (const record of records) {
        store.add({ t: record.t, channelId: record.channelId, payload: record.payload });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private _openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, this._dbVersion);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains("frames")) {
          const store = db.createObjectStore("frames", { autoIncrement: true });
          store.createIndex("by_t", "t");
          store.createIndex("by_channel_t", ["channelId", "t"]);
        }
      };
      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      req.onerror = () => reject(req.error);
    });
  }
}
