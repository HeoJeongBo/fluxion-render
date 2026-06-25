import { useEffect, useRef } from "react";

/**
 * Shared interval ticker.
 *
 * Many `useFluxionStream` instances pumping at the same rate (e.g. 120 small
 * charts on a dashboard) would otherwise each own a `setInterval`, multiplying
 * timer overhead and waking the event loop N times per tick. This registry
 * coalesces all subscribers at a given `intervalMs` onto a SINGLE timer that
 * fans out to every callback.
 *
 * It also pauses globally while the page is hidden (`document.hidden`) so the
 * main-thread data pumps stop generating samples no one can see — complementing
 * the worker-side render-loop pause already triggered by `Op.SET_VISIBLE`.
 */

type Tick = (now: number) => void;

interface TickerBucket {
  subs: Set<Tick>;
  handle: ReturnType<typeof setInterval>;
}

const buckets = new Map<number, TickerBucket>();

// Flipped by the `visibilitychange` listener below. While true, buckets skip
// their fan-out so subscribers stop ticking until the page is visible again.
let pageHidden = false;

/* v8 ignore start -- SSR guard: no `document` in non-DOM envs; unreachable in the happy-dom test environment. */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    pageHidden = document.visibilityState === "hidden";
  });
}
/* v8 ignore stop */

/**
 * Subscribe `fn` to a shared timer firing every `intervalMs`. Returns an
 * unsubscribe function; the underlying timer is cleared once its last
 * subscriber leaves. Calling the returned unsubscribe more than once is safe.
 */
export function subscribeTicker(intervalMs: number, fn: Tick): () => void {
  let bucket = buckets.get(intervalMs);
  if (!bucket) {
    const created: TickerBucket = {
      subs: new Set(),
      handle: setInterval(() => {
        if (pageHidden) return;
        const now = Date.now();
        // Isolate each subscriber: one chart's pump throwing must not skip the
        // other charts sharing this timer.
        for (const sub of created.subs) {
          try {
            sub(now);
          } catch (err) {
            console.error("[fluxion] shared-ticker subscriber error:", err);
          }
        }
      }, intervalMs),
    };
    bucket = created;
    buckets.set(intervalMs, created);
  }
  bucket.subs.add(fn);

  // `active` makes the returned unsubscribe idempotent — `bucket` is guaranteed
  // to still exist on the (only) effective call, since it can't be deleted while
  // this subscriber is in its `subs` set.
  const bucketRef = bucket;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    bucketRef.subs.delete(fn);
    if (bucketRef.subs.size === 0) {
      clearInterval(bucketRef.handle);
      buckets.delete(intervalMs);
    }
  };
}

/**
 * React wrapper around {@link subscribeTicker}. `fn` is captured by ref so an
 * unstable callback (inline arrow) doesn't re-subscribe every render; only
 * `intervalMs` drives the effect.
 */
export function useSharedTicker(intervalMs: number, fn: Tick): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    return subscribeTicker(intervalMs, (now) => fnRef.current(now));
  }, [intervalMs]);
}
