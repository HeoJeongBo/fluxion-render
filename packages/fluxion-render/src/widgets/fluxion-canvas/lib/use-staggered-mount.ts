import { useEffect, useRef, useState } from "react";

export interface UseStaggeredMountOptions {
  /**
   * Items revealed per animation frame. Higher = faster reveal but more work
   * landing in one frame; lower = smoother but slower. Default `16`.
   */
  perFrame?: number;
  /**
   * Skip staggering — return `total` immediately (e.g. when the list is small
   * or a caller wants to opt out). Default `false`.
   */
  disabled?: boolean;
}

/* v8 ignore start -- rAF is always present in the DOM test/runtime env; the setTimeout arm is an SSR/worker fallback */
function requestFrame(fn: () => void): number {
  if (typeof requestAnimationFrame === "undefined") {
    return setTimeout(fn, 16) as unknown as number;
  }
  return requestAnimationFrame(fn);
}
function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === "undefined") clearTimeout(id);
  else cancelAnimationFrame(id);
}
/* v8 ignore stop */

/**
 * Spread the MOUNTING of a large list across animation frames so a burst of
 * `<FluxionCanvas>`es doesn't reconcile + create N canvases (and their layout)
 * in a single React commit — the synchronous work that spikes the main thread
 * even when each host's creation is already staggered.
 *
 * Returns a `shown` count that starts at one batch and grows to `total` at
 * `perFrame` items per frame; render `Array.from({ length: shown }, …)` or
 * `items.slice(0, shown)`. The library owns the rAF cadence — the consumer just
 * renders the count.
 *
 * This is a fast, progressive reveal: **every** item still mounts (it is NOT
 * virtualization — nothing is unmounted when offscreen), just spread over a few
 * frames. A `total <= perFrame` list shows in full on the first frame, so small
 * grids have zero delay. To re-run the reveal (e.g. a grid that periodically
 * remounts), give the rendering subtree a React `key` so this hook re-mounts.
 *
 * Complements the per-chart `staggerMount` prop: that spreads each host's worker
 * creation across frames; this spreads the React-list component mount.
 */
export function useStaggeredMount(
  total: number,
  opts?: UseStaggeredMountOptions,
): number {
  const perFrame = Math.max(1, opts?.perFrame ?? 16);
  const disabled = opts?.disabled ?? false;
  const initial = disabled ? total : Math.min(perFrame, total);
  const [shown, setShown] = useState(initial);
  // The loop's source of truth — a synchronous ref so the reschedule decision
  // doesn't depend on when React flushes the `setShown` updater.
  const shownRef = useRef(initial);
  // Latest knobs for the rAF loop to read without restarting on every render.
  const knobs = useRef({ total, perFrame });
  knobs.current = { total, perFrame };

  useEffect(() => {
    if (disabled) {
      shownRef.current = total;
      setShown(total);
      return;
    }
    let raf = 0;
    let cancelled = false;
    const tick = () => {
      /* v8 ignore start -- defensive: cancelFrame() drops the pending frame on cleanup, so a tick never runs once cancelled flips on the normal path */
      if (cancelled) return;
      /* v8 ignore stop */
      const { total: t, perFrame: pf } = knobs.current;
      const next = Math.min(shownRef.current + pf, t);
      shownRef.current = next;
      setShown(next);
      if (next < t) raf = requestFrame(tick);
    };
    // Re-arm the ramp only while there's more to reveal (total grew, or first mount).
    if (shownRef.current < total) raf = requestFrame(tick);
    return () => {
      cancelled = true;
      cancelFrame(raf);
    };
  }, [disabled, total]); // re-arm when total grows or `disabled` toggles

  // Never report more than `total` (a shrunk total clamps immediately).
  return disabled ? total : Math.min(shown, total);
}
