import type { BaseChannel } from "../../../shared/model/base-channel";
import type { SerializedFrame } from "../../../shared/model/frame";
import { VirtualClock } from "../../../shared/lib/virtual-clock";
import type { ReplayStore } from "../../store/model/replay-store";

export type ReplayPlayerState = "idle" | "playing" | "paused" | "stopped";

export interface ReplayPlayerFrame<T = unknown> {
  readonly channelId: string;
  readonly data: T;
  readonly t: number;
}

export type FrameListener<T = unknown> = (frame: ReplayPlayerFrame<T>) => void;
export type TickListener = (currentT: number) => void;
export type StateListener = (state: ReplayPlayerState) => void;
export type EndListener = () => void;
export type SeekListener = (clampedT: number) => void;

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

/** Merges sorted `incoming` into sorted `target` in-place — O(n+m). */
function mergeSorted(target: SerializedFrame[], incoming: SerializedFrame[]): void {
  if (incoming.length === 0) return;
  if (target.length === 0) { target.push(...incoming); return; }
  const result: SerializedFrame[] = [];
  let i = 0, j = 0;
  while (i < target.length && j < incoming.length) {
    if (target[i].t <= incoming[j].t) result.push(target[i++]);
    else result.push(incoming[j++]);
  }
  while (i < target.length) result.push(target[i++]);
  while (j < incoming.length) result.push(incoming[j++]);
  target.length = 0;
  for (const f of result) target.push(f);
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
  private _seekListeners = new Set<SeekListener>();
  private _prefetchBuffer: SerializedFrame[] = [];
  private _prefetchedUpTo: number;
  private _isPrefetching = false;
  private _offTick: (() => void) | null = null;
  private _ended = false;

  constructor(opts: ReplayPlayerOptions) {
    this._store = opts.store;
    this._channels = opts.channels;
    this._timeRange = opts.timeRange;
    this._prefetchMs = opts.prefetchMs ?? DEFAULT_PREFETCH_MS;
    // Initialise to earliest - 1 so the first getFrames call uses an
    // inclusive lower bound (covering earliest exactly) while all subsequent
    // calls use lowerOpen=true to avoid re-fetching the boundary frame.
    this._prefetchedUpTo = opts.timeRange.earliest - 1;
    this._clock = new VirtualClock();
  }

  get currentT(): number {
    return this._clock.currentT;
  }

  get state(): ReplayPlayerState {
    return this._state;
  }

  /**
   * The `{ earliest, latest }` window the player operates over — captured at
   * construction and never mutated. `latest` doubles as the playback end
   * condition: `_onTick` fires `onEnd` once `currentT >= timeRange.latest`,
   * and `seek()` clamps targets into this range.
   *
   * Returned reference is the internal object; treat as read-only.
   */
  get timeRange(): { readonly earliest: number; readonly latest: number } {
    return this._timeRange;
  }

  seek(t: number): void {
    const clamped = Math.max(this._timeRange.earliest, Math.min(this._timeRange.latest, t));
    this._clock.seek(clamped);
    // Use at least 3s lookback so a keyframe (default interval = 2s) is always included
    // before the seek point — prevents VP8 decoder corruption from missing keyframes.
    const lookback = Math.max(this._prefetchMs, 3_000);
    this._prefetchBuffer = this._prefetchBuffer.filter((f) => f.t >= clamped - lookback);
    this._prefetchedUpTo = Math.max(clamped - lookback, this._timeRange.earliest) - 1;
    this._ended = false;
    for (const listener of this._seekListeners) listener(clamped);
  }

  play(rate = 1.0): void {
    if (this._state === "idle" || this._state === "stopped") {
      // Preserve a prior `seek()` target. Without this, `play()` would
      // silently rewind back to `timeRange.earliest`, breaking the
      // "seek then play" pattern every video player follows. Clamp into
      // range so a stale clock state (e.g. `stop()` zeroes it) still
      // lands at a sane starting point.
      const startT = Math.max(
        this._timeRange.earliest,
        Math.min(this._timeRange.latest, this._clock.currentT),
      );
      this._prefetchedUpTo = Math.max(startT - 3_000, this._timeRange.earliest) - 1;
      this._prefetchBuffer = [];
      this._ended = false;
      this._offTick?.();
      this._offTick = null;
      this._clock.start(startT, rate);
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

  /**
   * Subscribe to decoded frames. Two call forms:
   *
   * - `onFrame(listener)` — fires for every channel; `frame.data` is `unknown`.
   * - `onFrame(channel, listener)` — fires only for frames whose `channelId`
   *   matches `channel.channelId`; `frame.data` is typed as `T` so consumers
   *   don't have to cast. Internally still one shared listener set; the
   *   filter + cast happen at delivery time.
   */
  onFrame(listener: FrameListener<unknown>): () => void;
  onFrame<T>(channel: BaseChannel<T>, listener: FrameListener<T>): () => void;
  onFrame<T>(
    channelOrListener: BaseChannel<T> | FrameListener<unknown>,
    maybeListener?: FrameListener<T>,
  ): () => void {
    if (typeof channelOrListener === "function") {
      const l = channelOrListener as FrameListener;
      this._frameListeners.add(l);
      return () => this._frameListeners.delete(l);
    }
    // Channel-scoped overload — filter by channelId; the channel argument's
    // generic is the only reason we know `data` is `T`, so we cast inside.
    const targetId = channelOrListener.channelId;
    const typedListener = maybeListener as FrameListener<T>;
    const wrapper: FrameListener<unknown> = (frame) => {
      if (frame.channelId !== targetId) return;
      typedListener(frame as ReplayPlayerFrame<T>);
    };
    this._frameListeners.add(wrapper);
    return () => this._frameListeners.delete(wrapper);
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

  /**
   * Subscribe to `seek(t)` calls. Listener receives the clamped target time
   * (so callers can react without re-clamping). Useful for downstream
   * components — e.g. a chart that needs to re-hydrate from the store at
   * the new seek point — that can't be reached via the streaming `onFrame`
   * or `onTick` events.
   *
   * Returns an unsubscribe function.
   */
  onSeek(listener: SeekListener): () => void {
    this._seekListeners.add(listener);
    return () => this._seekListeners.delete(listener);
  }

  dispose(): void {
    this._clock.dispose();
    this._offTick?.();
    this._offTick = null;
    this._frameListeners.clear();
    this._tickListeners.clear();
    this._stateListeners.clear();
    this._endListeners.clear();
    this._seekListeners.clear();
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

    // Prefetch ahead — skip if a fetch is already in-flight
    if (!this._isPrefetching && currentT + this._prefetchMs > this._prefetchedUpTo) {
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
    this._isPrefetching = true;
    this._prefetchedUpTo = to;

    try {
      // lowerOpen=true: the lower bound is the previously fetched upper edge,
      // so using an exclusive lower bound prevents the boundary frame from
      // being re-fetched and emitted twice when prefetch windows adjoin.
      const frames = await this._store.getFrames(from, to, true);
      if (frames.length > 0) {
        mergeSorted(this._prefetchBuffer, frames);
      }
    } catch {
      // Roll back so the range is retried next tick
      this._prefetchedUpTo = from;
    } finally {
      this._isPrefetching = false;
    }
  }
}
