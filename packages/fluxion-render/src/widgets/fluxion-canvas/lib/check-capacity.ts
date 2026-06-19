import { computeRingCapacity } from "../../../shared/lib/ring-capacity";
import type { FluxionLayerSpec } from "./use-fluxion-canvas";

export interface CapacityAdvisory {
  /** Layer id with a potentially undersized ring. */
  id: string;
  /** The layer's effective ring capacity (explicit or derived). */
  capacity: number;
  /** Estimated samples the visible time window can hold at the layer's rate. */
  estimatedNeeded: number;
  /** Human-readable explanation. */
  message: string;
}

/** Streaming layer kinds whose ring capacity is worth validating. */
const STREAMING_KINDS = new Set([
  "line",
  "area",
  "step",
  "scatter",
  "scatter-colored",
  "candlestick",
  "pose-arrow",
  "trajectory",
  "stacked-area",
]);

type StreamConfig = {
  capacity?: number;
  retentionMs?: number;
  maxHz?: number;
};

/** Effective ring capacity for a streaming layer (explicit, derived, or default). */
function effectiveCapacity(config: StreamConfig | undefined): number {
  return computeRingCapacity(config ?? {}) ?? 2048; // 2048 = layer default
}

/**
 * Programmatically check whether each streaming layer's ring is large enough for
 * the visible time window — the diagnostic counterpart to the worker's one-time
 * console warning. Returns one advisory per under-sized layer (empty when all
 * fit), so you can surface it in a dev panel or fail a test.
 *
 * Needs the axis-grid layer's `timeWindowMs` to know the window. `assumedHz`
 * (default 60) approximates the push rate when a layer doesn't declare `maxHz`.
 */
export function checkCapacity(
  layers: FluxionLayerSpec[],
  opts: { assumedHz?: number } = {},
): CapacityAdvisory[] {
  const assumedHz = opts.assumedHz ?? 60;
  const axis = layers.find((l) => l.kind === "axis-grid");
  const windowMs = (axis?.config as { timeWindowMs?: number } | undefined)?.timeWindowMs;
  if (windowMs === undefined) return []; // no time window → nothing to validate

  const advisories: CapacityAdvisory[] = [];
  for (const spec of layers) {
    if (!STREAMING_KINDS.has(spec.kind)) continue;
    const config = spec.config as StreamConfig | undefined;
    const capacity = effectiveCapacity(config);
    const hz = config?.maxHz ?? assumedHz;
    const estimatedNeeded = Math.ceil((windowMs / 1000) * hz);
    if (capacity < estimatedNeeded) {
      advisories.push({
        id: spec.id,
        capacity,
        estimatedNeeded,
        message:
          `Layer "${spec.id}" ring capacity ${capacity} is below the ~${estimatedNeeded} ` +
          `samples the ${windowMs}ms window holds at ${hz}Hz — older samples may evict ` +
          "while still on screen. Raise capacity or set retentionMs + maxHz.",
      });
    }
  }
  return advisories;
}
