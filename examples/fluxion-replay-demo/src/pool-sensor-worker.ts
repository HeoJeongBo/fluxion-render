/**
 * Pool-aware sensor worker — BATCHED wire format (500 Hz fan-out).
 *
 * Main thread sends broadcastStream() ONCE per tick with a batch packet that
 * carries K samples per channel (so 500 Hz fits in one postMessage at a 50 Hz
 * tick rate):
 *   buffer = Float32Array[ 1 + K + K*activeCount ]
 *     [0]                 K            — samples per channel this tick (f32)
 *     [1 .. K]            t0_us..       — K microsecond timestamps (shared grid)
 *     [1+K ..]            ch0_v0..v(K-1), ch1_v0..v(K-1), ...  — raw ADC values
 *                                        in [-32767, 32767] (f32), channel-major
 *
 * Worker rebuilds an interleaved [t_ms, val, ...] batch per channel and pushes
 * it in one pushRaw → ring.pushMany:
 *   timestamp_ms = timestamp_us / 1000
 *   normalized   = raw_i16 / 32767  → [-1.0, 1.0]
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
      const k = raw[0]!; // samples per channel this tick
      const valuesBase = 1 + k; // raw[1..k] = timestamps; values start after
      for (let ci = 0; ci < s.targets.length; ci++) {
        const { hostId, layerId } = s.targets[ci]!;
        // Rebuild an interleaved [t_ms, val, ...] batch (k samples) for this
        // channel — one pushRaw → ring.pushMany, no per-sample postMessage.
        const decoded = new Float32Array(k * 2);
        const chBase = valuesBase + ci * k;
        for (let i = 0; i < k; i++) {
          decoded[i * 2] = raw[1 + i]! / 1000; // µs → ms
          decoded[i * 2 + 1] = raw[chBase + i]! / RAW_MAX; // → [-1, 1]
        }
        engines.get(hostId)?.pushRaw(layerId, decoded);
      }
      return;
    }

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
