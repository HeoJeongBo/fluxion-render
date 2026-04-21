import { useEffect, useRef, useState } from "react";
import type { FluxionHost } from "../../../features/host";

export interface UseFluxionTableOptions<T, R extends Record<string, unknown>> {
  /** Live host from `useFluxionCanvas` (or `null` during mount). */
  host: FluxionHost | null;
  /** Interval between data ticks in ms. Typically `1000 / dataHz`. */
  intervalMs: number;
  /**
   * How many times per second to flush pending rows into React state.
   * Default 1 (1 Hz). Set to 0 to flush every animation frame (rAF).
   */
  updateHz?: number;
  /** Maximum rows to keep. Oldest rows are dropped when exceeded. Default 50. */
  maxRows?: number;
  /**
   * One-shot initializer. Runs exactly once when `host` becomes non-null.
   * Return typed handles or any per-stream state; passed as second arg to `tick`.
   */
  setup: (host: FluxionHost) => T;
  /**
   * Called on every data tick. `tMs` is host-relative elapsed time (starts at 0).
   * Return a row object to append it to the table, or `null` to skip this tick.
   * You can also push to chart handles here — both chart and table update from
   * the same tick.
   */
  tick: (tMs: number, state: T) => R | null;
}

export interface UseFluxionTableResult<R> {
  /** Latest N rows, newest last. Flushed at `updateHz` frequency. */
  rows: R[];
  /** Data ticks per second, refreshed every 500ms. 0 until first tick. */
  rate: number;
}

/**
 * Drives a high-frequency data pump (same pattern as `useFluxionStream`) and
 * throttles row updates to React state at a much lower frequency (`updateHz`),
 * keeping the React reconciler load minimal even at 120 Hz input.
 *
 * Internally accumulates rows in a ref buffer on every data tick, then flushes
 * to state either on a fixed interval (`updateHz > 0`) or via rAF
 * (`updateHz === 0`). Only the flush triggers a React re-render.
 */
export function useFluxionTable<T, R extends Record<string, unknown>>(
  opts: UseFluxionTableOptions<T, R>,
): UseFluxionTableResult<R> {
  const { host, intervalMs, updateHz = 1, maxRows = 50 } = opts;
  const setupRef = useRef(opts.setup);
  const tickRef = useRef(opts.tick);
  setupRef.current = opts.setup;
  tickRef.current = opts.tick;

  const pendingRef = useRef<R[]>([]);
  const [rows, setRows] = useState<R[]>([]);
  const [rate, setRate] = useState(0);

  // Data pump — same structure as useFluxionStream
  useEffect(() => {
    if (!host) {
      setRate(0);
      pendingRef.current = [];
      return;
    }

    const state = setupRef.current(host);
    const t0 = Date.now();
    let pushes = 0;
    let lastReport = t0;

    const interval = setInterval(() => {
      const now = Date.now();
      const t = now - t0;
      let row: R | null = null;
      try {
        row = tickRef.current(t, state);
      } catch (err) {
        console.error("[useFluxionTable] tick error:", err);
      }
      if (row !== null) {
        pendingRef.current.push(row);
        pushes++;
      }
      if (now - lastReport >= 500) {
        setRate(Math.round((pushes * 1000) / (now - lastReport)));
        pushes = 0;
        lastReport = now;
      }
    }, intervalMs);

    return () => {
      clearInterval(interval);
      setRate(0);
      pendingRef.current = [];
    };
  }, [host, intervalMs]);

  // Flush loop — throttled at updateHz
  useEffect(() => {
    if (!host) return;

    const flush = () => {
      const pending = pendingRef.current;
      if (pending.length === 0) return;
      pendingRef.current = [];
      setRows((prev) => {
        const next = [...prev, ...pending];
        return next.length > maxRows ? next.slice(next.length - maxRows) : next;
      });
    };

    if (updateHz === 0) {
      let rafId: number;
      const loop = () => {
        flush();
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    }

    const id = setInterval(flush, 1000 / updateHz);
    return () => clearInterval(id);
  }, [host, updateHz, maxRows]);

  // Reset rows when host changes
  useEffect(() => {
    if (!host) setRows([]);
  }, [host]);

  return { rows, rate };
}
