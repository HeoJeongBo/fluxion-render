import { Emitter } from "../../../shared/lib/emitter";
import type { FluxionMetrics, MetricsListener } from "./fluxion-host";

/**
 * Main-thread diagnostics for a `FluxionHost`: push/sample/byte counters,
 * per-layer push counts, last-push time, the latest worker-reported bounds, and
 * the shared polling subscription. Extracted from `FluxionHost` so the host
 * stays focused on worker messaging and the metrics bookkeeping is testable in
 * isolation.
 *
 * The host feeds it via `recordPush` (on each `pushData`) and `recordBounds`
 * (on each worker BOUNDS_UPDATE), and delegates `getMetrics`/`onMetricsUpdate`
 * to it. All values are "what the main thread sent/observed" — ring eviction
 * happens worker-side and is not reflected here.
 */
export class MetricsTracker {
  private pushCount = 0;
  private sampleCount = 0;
  private bytesTransferred = 0;
  private readonly pushesByLayer = new Map<string, number>();
  private lastPushAt: number | null = null;
  private lastBounds: { yMin: number; yMax: number; latestT: number } | null = null;

  // Polled metrics subscription — one shared interval drives all listeners.
  private readonly listeners = new Emitter<[metrics: FluxionMetrics]>();
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Record a push of `length` samples / `byteLength` bytes for layer `id`. */
  recordPush(id: string, length: number, byteLength: number): void {
    this.pushCount++;
    this.sampleCount += length;
    this.bytesTransferred += byteLength;
    this.pushesByLayer.set(id, (this.pushesByLayer.get(id) ?? 0) + 1);
    /* v8 ignore start -- `performance` is always defined in the DOM test env; SSR fallback unreachable */
    this.lastPushAt =
      typeof performance !== "undefined" ? performance.now() : this.pushCount;
    /* v8 ignore stop */
  }

  /** Record the latest worker-reported y-bounds + latestT. */
  recordBounds(yMin: number, yMax: number, latestT: number): void {
    this.lastBounds = { yMin, yMax, latestT };
  }

  /** Cheap, poll-safe snapshot of current metrics. */
  getMetrics(): FluxionMetrics {
    return {
      pushCount: this.pushCount,
      sampleCount: this.sampleCount,
      bytesTransferred: this.bytesTransferred,
      pushesByLayer: Object.fromEntries(this.pushesByLayer),
      lastPushAt: this.lastPushAt,
      bounds: this.lastBounds ? { ...this.lastBounds } : null,
    };
  }

  /**
   * Subscribe to periodic snapshots. All subscribers share one interval; it
   * starts on the first subscription and stops when the last unsubscribes (or
   * on `dispose`). The FIRST subscriber's `intervalMs` sets the rate.
   */
  onMetricsUpdate(cb: MetricsListener, opts?: { intervalMs?: number }): () => void {
    const off = this.listeners.subscribe(cb);
    if (this.timer === null) {
      this.timer = setInterval(() => {
        this.listeners.emit(this.getMetrics());
      }, opts?.intervalMs ?? 250);
    }
    return () => {
      off();
      if (this.listeners.size === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /**
   * Zero all counters back to a just-constructed state for host recycling,
   * KEEPING the shared polling subscription intact (a reused host's new consumer
   * subscribes fresh; the previous tenant already unsubscribed on unmount).
   */
  reset(): void {
    this.pushCount = 0;
    this.sampleCount = 0;
    this.bytesTransferred = 0;
    this.pushesByLayer.clear();
    this.lastPushAt = null;
    this.lastBounds = null;
  }

  /** Stop the shared interval and drop all subscribers. */
  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.listeners.clear();
  }
}
