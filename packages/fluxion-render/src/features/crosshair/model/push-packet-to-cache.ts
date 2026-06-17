import type { HoverDataCache } from "./hover-data-cache";

/**
 * Mirror one broadcast packet into a {@link HoverDataCache} so a chart driven by
 * the managed-pool path (`FluxionHost.emitPoolStream`) can still feed a
 * crosshair.
 *
 * In pool mode the per-sample data is decoded inside the worker and fanned out
 * to layers there — the main thread never sees it, so the crosshair (which
 * reads from a main-thread cache) has nothing to look up. This util closes that
 * gap: call it with the SAME interleaved `[t, y, …]` packet you hand to
 * `emitPoolStream`, and the same target layer ids, just BEFORE the transfer.
 *
 * IMPORTANT: call this BEFORE `emitPoolStream` / any `postMessage([buffer])`
 * transfer. Transferring detaches the underlying `ArrayBuffer`, after which the
 * packet can no longer be read. Mirroring first reads it while still attached.
 *
 * Each id in `layerIds` receives the same packet (broadcast semantics, matching
 * `emitPoolStream`'s "decode once, push to all targets"). Unregistered ids are
 * silently skipped (the cache's `pushBatch` no-ops them).
 */
export function pushPacketToCache(
  cache: HoverDataCache,
  layerIds: readonly string[],
  packet: Float32Array,
): void {
  for (const id of layerIds) cache.pushBatch(id, packet);
}
