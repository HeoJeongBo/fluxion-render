/**
 * Streaming-layer ring-buffer capacity from config. Every streaming entity
 * layer derives its ring size the same way: an explicit `capacity` wins;
 * otherwise size it from `retentionMs` + `maxHz` (how many samples a window of
 * `retentionMs` holds at `maxHz`, plus 10% headroom for batch overshoot);
 * otherwise leave it to the caller's default.
 */
export interface RingCapacityConfig {
  capacity?: number;
  retentionMs?: number;
  maxHz?: number;
}

/**
 * Returns the ring capacity implied by `config`, or `undefined` when neither an
 * explicit `capacity` nor a `retentionMs` + `maxHz` pair is present (the caller
 * keeps its existing/default capacity in that case).
 */
export function computeRingCapacity(config: RingCapacityConfig): number | undefined {
  if (config.capacity !== undefined) return config.capacity;
  if (config.retentionMs !== undefined && config.maxHz !== undefined) {
    return Math.ceil((config.retentionMs / 1000) * config.maxHz * 1.1);
  }
  return undefined;
}
