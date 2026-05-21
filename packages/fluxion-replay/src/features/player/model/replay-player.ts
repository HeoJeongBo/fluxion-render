import type { BaseChannel } from "../../../shared/model/base-channel";
import type { SerializedFrame } from "../../../shared/model/frame";
import { VirtualClock } from "../../../shared/lib/virtual-clock";
import type { ReplayStore } from "../../store/model/replay-store";

export type ReplayPlayerState = "idle" | "playing" | "paused" | "stopped";

export interface ReplayPlayerFrame {
  readonly channelId: string;
  readonly data: unknown;
  readonly t: number;
}

export type FrameListener = (frame: ReplayPlayerFrame) => void;
export type TickListener = (currentT: number) => void;
export type StateListener = (state: ReplayPlayerState) => void;
export type EndListener = () => void;

export interface ReplayPlayerOptions {
  store: ReplayStore;
  channels: Map<string, BaseChannel<unknown>>;
  timeRange: { earliest: number; latest: number };
  prefetchMs?: number;
}

const DEFAULT_PREFETCH_MS = 2_000;

/** Returns the index of the first element with t > value (sorted ascending). */
function upperBound(arr: SerializedFrame[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].t <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Merges sorted `incoming` into sorted `target` in-place. */
function mergeSorted(target: SerializedFrame[], incoming: SerializedFrame[]): void {
  for (const frame of incoming) {
    const pos = upperBound(target, frame.t);
    target.splice(pos, 0, frame);
  }
}

export class ReplayPlayer {
  private readonly _clock: VirtualClock;
  private readonly _store: ReplayStore;
  private readonly _channels: Map<string, BaseChannel<unknown>>;
  private readonly _timeRange: { earliest: number; latest: number };
  private readonly _prefetchMs: number;
  private _state: ReplayPlayerState = "idle";
  private _frameListeners = new Set<FrameListener>();
  private _tickListeners = new Set<TickListener>();
  private _stateListeners = new Set<StateListener>();
  private _endListeners = new Set<EndListener>();
  private _prefetchBuffer: SerializedFrame[] = [];
  private _prefetchedUpTo: number;
  private _offTick: (() => void) | null = null;
  private _ended = false;

  constructor(opts: ReplayPlayerOptions) {
    this._store = opts.store;
    this._channels = opts.channels;
    this._timeRange = opts.timeRange;
    this._prefetchMs = opts.prefetchMs ?? DEFAULT_PREFETCH_MS;
    this._prefetchedUpTo = opts.timeRange.earliest;
    this._clock = new VirtualClock();
  }

  get currentT(): number {
    return this._clock.currentT;
  }

  get state(): ReplayPlayerState {
    return this._state;
  }

  seek(t: number): void {
    const clamped = Math.max(this._timeRange.earliest, Math.min(this._timeRange.latest, t));
    this._clock.seek(clamped);
    this._prefetchBuffer = this._prefetchBuffer.filter((f) => f.t >= clamped);
    // Pull back prefetch cursor so the next tick re-queries from seek point
    this._prefetchedUpTo = Math.max(clamped - this._prefetchMs, this._timeRange.earliest);
    this._ended = false;
  }

  play(rate = 1.0): void {
    if (this._state === "idle" || this._state === "stopped") {
      this._prefetchedUpTo = this._timeRange.earliest;
      this._prefetchBuffer = [];
      this._ended = false;
      this._offTick?.();
      this._offTick = null;
      this._clock.start(this._timeRange.earliest, rate);
      this._offTick = this._clock.onTick((t) => this._onTick(t));
    } else if (this._state === "paused") {
      this._clock.setRate(rate);
      this._clock.resume();
    } else {
      this._clock.setRate(rate);
      return;
    }
    this._setState("playing");
  }

  pause(): void {
    if (this._state !== "playing") return;
    this._clock.pause();
    this._setState("paused");
  }

  stop(): void {
    this._clock.stop();
    this._offTick?.();
    this._offTick = null;
    this._prefetchBuffer = [];
    this._prefetchedUpTo = this._timeRange.earliest;
    this._ended = false;
    this._setState("stopped");
  }

  onFrame(listener: FrameListener): () => void {
    this._frameListeners.add(listener);
    return () => this._frameListeners.delete(listener);
  }

  onTick(listener: TickListener): () => void {
    this._tickListeners.add(listener);
    return () => this._tickListeners.delete(listener);
  }

  onStateChange(listener: StateListener): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  onEnd(listener: EndListener): () => void {
    this._endListeners.add(listener);
    return () => this._endListeners.delete(listener);
  }

  dispose(): void {
    this._clock.dispose();
    this._offTick?.();
    this._offTick = null;
    this._frameListeners.clear();
    this._tickListeners.clear();
    this._stateListeners.clear();
    this._endListeners.clear();
    this._prefetchBuffer = [];
  }

  private _setState(state: ReplayPlayerState): void {
    this._state = state;
    for (const listener of this._stateListeners) {
      listener(state);
    }
  }

  private _onTick(currentT: number): void {
    if (this._ended) return;

    // Check for end of timeline
    if (currentT >= this._timeRange.latest) {
      this._ended = true;
      this.pause();
      for (const listener of this._endListeners) listener();
      return;
    }

    // Prefetch ahead
    if (currentT + this._prefetchMs > this._prefetchedUpTo) {
      void this._prefetch(currentT);
    }

    // Drain buffered frames up to currentT.
    // Buffer is kept sorted by t, so find the first frame past currentT with
    // binary search and splice in O(k) instead of scanning the whole buffer.
    const cutoff = upperBound(this._prefetchBuffer, currentT);
    const toEmit = cutoff > 0 ? this._prefetchBuffer.splice(0, cutoff) : [];

    for (const f of toEmit) {
      const channel = this._channels.get(f.channelId);
      if (!channel) continue;
      const data = channel.decode(f.payload);
      const playerFrame: ReplayPlayerFrame = { channelId: f.channelId, data, t: f.t };
      for (const listener of this._frameListeners) listener(playerFrame);
    }

    // Emit tick
    for (const listener of this._tickListeners) listener(currentT);
  }

  private async _prefetch(currentT: number): Promise<void> {
    const from = this._prefetchedUpTo;
    const to = Math.min(currentT + this._prefetchMs, this._timeRange.latest);
    if (from >= to) return;
    // Claim the range before awaiting to prevent duplicate queries from concurrent ticks
    this._prefetchedUpTo = to;

    try {
      const frames = await this._store.getFrames(from, to);
      if (frames.length > 0) {
        mergeSorted(this._prefetchBuffer, frames);
      }
    } catch {
      // Roll back so the range is retried next tick
      this._prefetchedUpTo = from;
    }
  }
}
