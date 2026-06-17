import { useCallback } from "react";
import type { HoverDataCache } from "./hover-data-cache";
import { pushPacketToCache } from "./push-packet-to-cache";
import { type UseHoverDataCacheOptions, useHoverDataCache } from "./use-hover-data-cache";

export interface UseBroadcastCrosshairCacheOptions extends UseHoverDataCacheOptions {}

export interface UseBroadcastCrosshairCacheResult {
  /** Stable cache — pass straight to `useFluxionCrosshair({ host, cache })`. */
  cache: HoverDataCache;
  /**
   * Mirror one broadcast packet into the cache. Call with the same packet +
   * target layer ids you pass to `emitPoolStream`, BEFORE the transfer (the
   * buffer detaches on transfer). See {@link pushPacketToCache}.
   */
  mirror: (layerIds: readonly string[], packet: Float32Array) => void;
}

/**
 * Crosshair cache for managed-pool charts. Wraps {@link useHoverDataCache} and
 * adds a `mirror` callback that copies each broadcast packet into the cache so
 * the (main-thread) crosshair can find samples even though the real data is
 * fanned out inside the worker.
 *
 * ```ts
 * const { cache, mirror } = useBroadcastCrosshairCache({ layers });
 * // in the broadcast tick, BEFORE emitPoolStream(targets, buffer, len):
 * mirror(targets.map((t) => t.layerId), new Float32Array(buffer));
 * host.emitPoolStream(targets, buffer, len);
 * // and wire the crosshair as usual:
 * const { chartRef, state } = useFluxionCrosshair({ host, cache, xMode: "time", ... });
 * ```
 */
export function useBroadcastCrosshairCache(
  opts: UseBroadcastCrosshairCacheOptions = {},
): UseBroadcastCrosshairCacheResult {
  const { cache } = useHoverDataCache(opts);
  const mirror = useCallback(
    (layerIds: readonly string[], packet: Float32Array) =>
      pushPacketToCache(cache, layerIds, packet),
    [cache],
  );
  return { cache, mirror };
}
