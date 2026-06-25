/**
 * Batched broadcast worker — receives ONE packet per tick carrying MULTIPLE
 * samples per channel, decodes each channel into a sample batch, and pushes it
 * to the matching engine. This is how 500 Hz is reached over a stable ~50 Hz
 * timer (10 samples/channel/packet), and it works across a MULTI-worker pool.
 *
 * Wire format — Float32Array[ 3 + N*n ] (N = channels, n = samples/channel):
 *   [0]                 t0_us     — first sample timestamp (µs)
 *   [1]                 dt_us     — sample interval (µs)
 *   [2]                 n         — samples per channel
 *   [3 + ch*n + j]      raw_i16   — channel `ch`, sample `j`  (ADC [-32767, 32767])
 *
 * Each target carries its channel index `ch` (so multi-worker grouping stays
 * correct — broadcastStream gives each worker only its subset of targets, but
 * the full buffer, so positional indexing would be wrong). The worker reads
 * `ch` per target (falling back to the positional index for single-worker use).
 */

import type {
  FluxionPoolStreamMsg,
  HostMsg,
  PoolDisposeMsg,
  PoolInitMsg,
} from "@heojeongbo/fluxion-render/worker";
import { Engine, Op } from "@heojeongbo/fluxion-render/worker";

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
        // Forward the perf knobs the built-in worker also forwards — without
        // this the demo's maxFps / emitBounds / emitTicks would be dropped.
        maxFps: m.maxFps,
        emitBounds: m.emitBounds,
        emitTicks: m.emitTicks,
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
      // Clamp to the buffer's real capacity so a malformed length never throws.
      const len = Math.max(0, Math.min(s.length | 0, s.buffer.byteLength >>> 2));
      const raw = new Float32Array(s.buffer, 0, len);
      const t0ms = raw[0]! / 1000; // µs → ms
      const dtMs = raw[1]! / 1000;
      const n = Math.max(0, raw[2]! | 0);
      for (let ci = 0; ci < s.targets.length; ci++) {
        const t = s.targets[ci]!;
        const ch = (t as { ch?: number }).ch ?? ci;
        const base = 3 + ch * n;
        const batch = new Float32Array(n * 2);
        for (let j = 0; j < n; j++) {
          batch[j * 2] = t0ms + j * dtMs;
          batch[j * 2 + 1] = raw[base + j]! / RAW_MAX; // raw → [-1, 1]
        }
        engines.get(t.hostId)?.pushRaw(t.layerId, batch);
      }
      return;
    }

    // Standard HostMsg — route by hostId.
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
    console.error("[broadcast-batch-worker] error:", err);
  }
};
