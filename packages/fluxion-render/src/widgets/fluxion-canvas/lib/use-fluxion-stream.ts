import { useEffect, useRef, useState } from "react";
import type { FluxionHost } from "../../../features/host";

export interface UseFluxionStreamOptions<T> {
  /** Live host from `useFluxionCanvas` (or `null` during mount). */
  host: FluxionHost | null;
  /** Interval between ticks in ms. Typically `1000 / targetHz`. */
  intervalMs: number;
  /**
   * One-shot initializer. Runs exactly once when `host` transitions from
   * null to non-null. Use it to resolve typed handles (`host.line("id")`)
   * or cache per-stream state. The returned value is passed as the second
   * argument to `tick` on every interval fire.
   */
  setup: (host: FluxionHost) => T;
  /**
   * Called on every interval tick. `tMs` is host-relative (starts at 0
   * when the first tick fires). Return the number of samples you pushed
   * this tick for rate tracking; return 0 if you don't care.
   */
  tick: (tMs: number, state: T) => number;
}

export interface UseFluxionStreamResult {
  /** Samples pushed per second, refreshed every 500ms. 0 until first batch. */
  rate: number;
}

/**
 * Runs a `setInterval`-driven data pump against a FluxionRender host with
 * built-in rate tracking. Handles the boilerplate that every streaming demo
 * repeats:
 *
 *   - Wait for `host` to become non-null
 *   - Establish a host-relative time origin on first tick
 *   - Resolve typed handles once (via `setup`)
 *   - Fire `tick(t, state)` on an interval
 *   - Accumulate sample counts into a 500ms-window rate estimate
 *   - Clean up the interval on unmount / host change
 *
 * `setup` and `tick` are captured by ref so unstable references (e.g. inline
 * arrow functions) don't tear down the interval on every render. Only `host`
 * and `intervalMs` drive the effect.
 *
 * Errors thrown inside `tick` are caught and logged — the interval keeps
 * running. This matches the worker's own error-handling behavior.
 */
export function useFluxionStream<T>(
  opts: UseFluxionStreamOptions<T>,
): UseFluxionStreamResult {
  const { host, intervalMs } = opts;
  const setupRef = useRef(opts.setup);
  const tickRef = useRef(opts.tick);
  setupRef.current = opts.setup;
  tickRef.current = opts.tick;

  const [rate, setRate] = useState(0);

  useEffect(() => {
    if (!host) {
      setRate(0);
      return;
    }

    const state = setupRef.current(host);
    const t0 = Date.now();
    let pushes = 0;
    let lastReport = t0;

    const interval = setInterval(() => {
      const now = Date.now();
      const t = now - t0;
      let n = 0;
      try {
        n = tickRef.current(t, state) || 0;
      } catch (err) {
        console.error("[useFluxionStream] tick error:", err);
      }
      pushes += n;
      if (now - lastReport >= 500) {
        setRate(Math.round((pushes * 1000) / (now - lastReport)));
        pushes = 0;
        lastReport = now;
      }
    }, intervalMs);

    return () => {
      clearInterval(interval);
      setRate(0);
    };
  }, [host, intervalMs]);

  return { rate };
}
