import { useEffect, type RefObject } from "react";

export interface ResizeInfo {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Observes both element size (ResizeObserver) and devicePixelRatio changes
 * (matchMedia on the current DPR). Fires `onResize` whenever either changes.
 *
 * `debounceMs` (default 100) batches rapid resize events — e.g. when many
 * charts are mounted simultaneously and a window resize fires 160 callbacks
 * at once. Set to 0 to disable debouncing.
 */
export function useResizeObserver(
  ref: RefObject<HTMLElement>,
  onResize: (info: ResizeInfo) => void,
  opts?: { debounceMs?: number },
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const debounceMs = opts?.debounceMs ?? 100;

    let mql: MediaQueryList | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      if (cancelled) return;
      const rect = el.getBoundingClientRect();
      onResize({
        width: rect.width,
        height: rect.height,
        dpr: window.devicePixelRatio || 1,
      });
    };

    const debouncedFire =
      debounceMs > 0
        ? () => {
            clearTimeout(timer);
            timer = setTimeout(fire, debounceMs);
          }
        : fire;

    const subscribeDpr = () => {
      if (mql) mql.removeEventListener("change", handleDpr);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", handleDpr);
    };
    const handleDpr = () => {
      debouncedFire();
      subscribeDpr();
    };

    const ro = new ResizeObserver(debouncedFire);
    ro.observe(el);
    subscribeDpr();
    fire(); // initial fire is immediate (not debounced)

    return () => {
      cancelled = true;
      clearTimeout(timer);
      ro.disconnect();
      if (mql) mql.removeEventListener("change", handleDpr);
    };
  }, [ref, onResize]);
}
