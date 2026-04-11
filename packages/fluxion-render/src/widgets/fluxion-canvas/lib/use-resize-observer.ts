import { useEffect, type RefObject } from "react";

export interface ResizeInfo {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Observes both element size (ResizeObserver) and devicePixelRatio changes
 * (matchMedia on the current DPR). Fires `onResize` whenever either changes.
 */
export function useResizeObserver(
  ref: RefObject<HTMLElement>,
  onResize: (info: ResizeInfo) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let mql: MediaQueryList | null = null;
    let cancelled = false;

    const fire = () => {
      if (cancelled) return;
      const rect = el.getBoundingClientRect();
      onResize({
        width: rect.width,
        height: rect.height,
        dpr: window.devicePixelRatio || 1,
      });
    };

    const subscribeDpr = () => {
      if (mql) mql.removeEventListener("change", handleDpr);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", handleDpr);
    };
    const handleDpr = () => {
      fire();
      subscribeDpr();
    };

    const ro = new ResizeObserver(fire);
    ro.observe(el);
    subscribeDpr();
    fire();

    return () => {
      cancelled = true;
      ro.disconnect();
      if (mql) mql.removeEventListener("change", handleDpr);
    };
  }, [ref, onResize]);
}
