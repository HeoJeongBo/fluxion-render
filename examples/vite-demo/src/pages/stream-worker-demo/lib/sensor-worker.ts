/**
 * Custom sensor worker — decodes raw sensor payloads inside the worker.
 *
 * Main thread sends:
 *   - HostMsg       (INIT, ADD_LAYER, RESIZE, DISPOSE, …) via rpcHandler
 *   - StreamDataMsg (raw wire format, zero-copy transfer) via streamHandler
 *
 * Wire format per sample (2× f32):
 *   [0] timestamp_us  — microsecond timestamp (Float32)
 *   [1] raw_value     — sensor ADC value in [-32767, 32767] range
 *
 * Decode (worker-side, never touches main thread):
 *   timestamp_ms = timestamp_us / 1000
 *   normalized   = raw_value / 32767   → [-1.0, 1.0]
 *
 * Output written into a reusable decode buffer → engine.pushRaw()
 * No allocation on the hot path once the decode buffer is allocated.
 */
import {
  Engine,
  Op,
  defineWorkerWithState,
  type HostMsg,
  type StreamDataMsg,
} from "@heojeongbo/fluxion-render/worker";

const RAW_MAX = 32767;

defineWorkerWithState<HostMsg, object, Engine, StreamDataMsg>(
  (msg, _reply, ctx) => {
    const engine = ctx.state ?? new Engine();
    engine.dispatch(msg as HostMsg);
    if ((msg as HostMsg).op === Op.DISPOSE) return null;
    return engine;
  },
  (msg, _push, ctx) => {
    const engine = ctx.state;
    if (!engine) return;

    const sampleCount = msg.length >> 1;  // 2 f32 per sample
    const raw = new Float32Array(msg.buffer, 0, msg.length);

    // Decode in-place into a fresh Float32Array (line layer layout: [t_ms, y, ...])
    const decoded = new Float32Array(sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
      decoded[i * 2]     = raw[i * 2]! / 1000;          // µs → ms
      decoded[i * 2 + 1] = raw[i * 2 + 1]! / RAW_MAX;  // raw → [-1, 1]
    }

    engine.pushRaw(msg.id, decoded);
  },
);
