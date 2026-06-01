/**
 * Pool-aware sensor worker — receives ONE RAW-style packet per tick,
 * decodes each channel, and pushes 1 sample to the matching engine.
 *
 * Main thread sends broadcastStream() ONCE with the packet:
 *   buffer = Float32Array[ 1 + activeCount ]
 *     [0]       timestamp_us  — microsecond timestamp (f32)
 *     [1..N]    ch0_raw .. chN_raw  — ADC values in [-32767, 32767] (f32)
 *
 * targets[ci] always corresponds to buf[1+ci] (guaranteed by main thread).
 *
 * Worker decodes each channel and pushes to the matching Engine:
 *   timestamp_ms = timestamp_us / 1000
 *   normalized   = raw_i16 / 32767  → [-1.0, 1.0]
 *
 * Result: 1 postMessage → worker parses → each engine gets 1 sample.
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
      // RAW packet: raw[0] = timestamp_us, raw[1+ci] = ch_ci raw_i16
      const t_ms = raw[0]! / 1000; // µs → ms
      for (let ci = 0; ci < s.targets.length; ci++) {
        const { hostId, layerId } = s.targets[ci]!;
        const decoded = new Float32Array(2);
        decoded[0] = t_ms;
        decoded[1] = raw[1 + ci]! / RAW_MAX; // raw → [-1, 1]
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
