import type { RingBuffer } from "../model/ring-buffer";
import type { Viewport } from "../model/viewport";

/**
 * Push an interleaved sample batch into a layer's ring buffer and advance the
 * shared `viewport.latestT` to the newest timestamp in the batch. The `t` of
 * each stride-N record sits at its first slot, so the newest record's `t` is at
 * `arr[length - stride]`.
 *
 * Shared by the streaming layers whose record layout starts with `t`
 * (line/scatter/step/area/scatter-colored/candlestick). Layers whose timestamp
 * is not at the record start (e.g. trajectory) or that need an extra guard
 * (pose-arrow) keep their own `setData`.
 *
 * No-ops when `length` is shorter than one full record.
 */
export function pushSamples(
  ring: RingBuffer,
  buffer: ArrayBuffer,
  length: number,
  viewport: Viewport,
  stride: number,
): void {
  if (length < stride) return;
  const arr = new Float32Array(buffer, 0, length);
  ring.pushMany(arr);
  const t = arr[length - stride];
  if (t > viewport.latestT) viewport.latestT = t;
}
