import { useMemo, useEffect } from "react";
import type { FluxionHost } from "../../../features/host";
import type { XyPoint } from "../../../features/host";

export interface UseFluxionHistoricalOptions {
  /** Host returned by `onReady` / `useFluxionCanvas`. No-op while null. */
  host: FluxionHost | null;
  /** ID of the `line-static` layer to push data into. */
  layerId: string;
  /**
   * Dataset to display. Every time this reference changes the layer is
   * replaced with the new data in one postMessage transfer.
   *
   * - `XyPoint[]`  → requires `layout: "xy"` (default) on the layer config
   * - `number[]`   → requires `layout: "y"` on the layer config; x positions
   *                  are computed from the layer's configured x range
   *
   * Pass `null` or `undefined` to leave the layer empty.
   */
  data: readonly XyPoint[] | readonly number[] | null | undefined;
  /**
   * Must match the `layout` set on the `line-static` layer config.
   * Default `"xy"`.
   */
  layout?: "xy" | "y";
}

/**
 * Pushes a historical dataset into a `line-static` layer whenever `data`
 * changes. Equivalent to calling `host.lineStatic(layerId).setXY(data)` (or
 * `setY`) inside a `useEffect`, but with handle memoization built in.
 *
 * Pair with `axisGridLayer({ xMode: "fixed", xRange: [...], yMode: "auto" })`
 * and `lineStaticLayer(id, { layout: "xy" })`.
 */
export function useFluxionHistorical({
  host,
  layerId,
  data,
  layout = "xy",
}: UseFluxionHistoricalOptions): void {
  const handle = useMemo(
    () => (host ? host.lineStatic(layerId) : null),
    [host, layerId],
  );

  useEffect(() => {
    if (!handle || !data || data.length === 0) return;
    if (layout === "y") {
      handle.setY(data as readonly number[]);
    } else {
      handle.setXY(data as readonly XyPoint[]);
    }
  }, [handle, data, layout]);
}
