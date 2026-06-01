/**
 * Pool-aware sensor worker — decodes raw sensor payloads inside the worker.
 *
 * Manages multiple Engine instances (one per hostId) to support the pool
 * pattern where a single worker handles many canvases. Receives:
 *   - Standard HostMsg (POOL_INIT, RESIZE, ADD_LAYER, ...) — op-based routing
 *   - FluxionPoolStreamMsg (mode: "pool-stream") — decode once, fan-out to N engines
 *
 * Wire format per sample (2× f32):
 *   [0] timestamp_us  — microsecond timestamp
 *   [1] raw_value     — sensor ADC value in [-32767, 32767]
 *
 * Decode (worker-side):
 *   timestamp_ms = timestamp_us / 1000
 *   normalized   = raw_value / 32767  → [-1.0, 1.0]
 */
import { Engine, Op } from "@heojeongbo/fluxion-render/worker";
import type {
  FluxionPoolStreamMsg,
  HostMsg,
  PoolDisposeMsg,
  PoolInitMsg,
} from "@heojeongbo/fluxion-render/worker";

const RAW_MAX = 32767;
const SOLO_HOST_ID = "__solo__";
const engines = new Map<string, Engine>();

self.onmessage = (e: MessageEvent) => {
  try {
    const msg = e.data as HostMsg | FluxionPoolStreamMsg | { mode?: string };

    if ("op" in msg && msg.op === Op.POOL_INIT) {
      const m = msg as PoolInitMsg;
      const engine = new Engine();
      engines.set(m.hostId, engine);
      engine.dispatch({
        op: Op.INIT,
        canvas: m.canvas,
        width: m.width,
        height: m.height,
        dpr: m.dpr,
        bgColor: m.bgColor,
        hostId: m.hostId,
      });
      return;
    }

    if ("op" in msg && msg.op === Op.POOL_DISPOSE) {
      const m = msg as PoolDisposeMsg;
      engines.get(m.hostId)?.dispatch({ op: Op.DISPOSE });
      engines.delete(m.hostId);
      return;
    }

    if ((msg as { mode?: string }).mode === "pool-stream") {
      const s = msg as FluxionPoolStreamMsg;
      const raw = new Float32Array(s.buffer, 0, s.length);
      const sampleCount = s.length >> 1;
      const decoded = new Float32Array(sampleCount * 2);
      for (let i = 0; i < sampleCount; i++) {
        decoded[i * 2]     = raw[i * 2]! / 1000;       // µs → ms
        decoded[i * 2 + 1] = raw[i * 2 + 1]! / RAW_MAX; // raw → [-1, 1]
      }
      for (const { hostId, layerId } of s.targets) {
        engines.get(hostId)?.pushRaw(layerId, decoded);
      }
      return;
    }

    // Standard HostMsg — route by hostId
    const hostMsg = msg as HostMsg;
    const hostId = ("hostId" in hostMsg ? hostMsg.hostId : undefined) ?? SOLO_HOST_ID;

    if ("op" in hostMsg && hostMsg.op === Op.INIT) {
      const engine = new Engine();
      engines.set(hostId, engine);
      engine.dispatch(hostMsg);
      return;
    }

    if ("op" in hostMsg && hostMsg.op === Op.DISPOSE) {
      engines.get(hostId)?.dispatch(hostMsg);
      engines.delete(hostId);
      return;
    }

    engines.get(hostId)?.dispatch(hostMsg);
  } catch (err) {
    console.error("[pool-sensor-worker] error:", err);
  }
};
