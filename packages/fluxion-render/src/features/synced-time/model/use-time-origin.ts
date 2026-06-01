import { useMemo } from "react";

/**
 * Returns a stable `Date.now()` timestamp captured on the component's first render.
 * Use as `timeOrigin` for `axisGridLayer` so the chart's time window starts at mount.
 */
export function useTimeOrigin(): number {
  return useMemo(() => Date.now(), []);
}
