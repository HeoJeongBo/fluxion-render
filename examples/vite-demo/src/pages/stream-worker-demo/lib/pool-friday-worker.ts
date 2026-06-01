/**
 * Friday 0x0001 pool worker — receives one Friday packet per tick, parses
 * Joint Position (actual) at offset 164 (= 4-byte t_ms prefix + 160), and
 * pushes 1 sample to each engine.
 *
 * Wire format sent by main thread (1252 bytes):
 *   [0..3]      Float32 LE: t_ms (elapsed ms since timeOrigin)
 *   [4..1251]   Friday 0x0001 packet (1248 bytes, raw binary)
 *
 * Friday packet layout (relevant fields):
 *   offset   0: Position f32×3 (12 B)
 *   offset  12: Reserved (8 B)
 *   offset  20: Orientation i16×3 (6 B)
 *   offset  26: Battery×2 (4 B)
 *   offset  30: Ping u16 (2 B)
 *   offset  32: Joint Position Cmd i16×64 (128 B)
 *   offset 160: Joint Position actual i16×64 (128 B)  ← decoded here
 *   ...
 *
 * targets[ci] ↔ Joint Position[ci] — same ordering guaranteed by main thread.
 */
import { Engine, Op } from "@heojeongbo/fluxion-render/worker";
import type {
  FluxionPoolStreamMsg,
  HostMsg,
  PoolDisposeMsg,
  PoolInitMsg,
} from "@heojeongbo/fluxion-render/worker";

const JOINT_POS_OFFSET = 4 + 160; // 4-byte t_ms prefix + Friday packet offset 160
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
      const view = new DataView(s.buffer);
      // [0..3] = t_ms prefix (Float32 LE)
      const t_ms = view.getFloat32(0, true);
      // [4+160 ..] = Joint Position actual, i16 LE, unit 2π/65536
      for (let ci = 0; ci < s.targets.length; ci++) {
        const { hostId, layerId } = s.targets[ci]!;
        const raw = view.getInt16(JOINT_POS_OFFSET + ci * 2, true);
        const decoded = new Float32Array(2);
        decoded[0] = t_ms;
        decoded[1] = raw / RAW_MAX; // [-1, 1]
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
    console.error("[pool-friday-worker] error:", err);
  }
};
