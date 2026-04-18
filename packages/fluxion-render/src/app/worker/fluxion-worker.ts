import { Engine } from "../../features/engine";
import type { HostMsg } from "../../shared/protocol";
import { Op } from "../../shared/protocol";

const SOLO_HOST_ID = "__solo__";
const engines = new Map<string, Engine>();

self.onmessage = (e: MessageEvent<HostMsg>) => {
  try {
    const msg = e.data;

    if (msg.op === Op.POOL_INIT) {
      const engine = new Engine();
      engines.set(msg.hostId, engine);
      engine.dispatch({
        op: Op.INIT,
        canvas: msg.canvas,
        width: msg.width,
        height: msg.height,
        dpr: msg.dpr,
        bgColor: msg.bgColor,
        hostId: msg.hostId,
      });
      return;
    }

    if (msg.op === Op.POOL_DISPOSE) {
      const engine = engines.get(msg.hostId);
      if (engine) {
        engine.dispatch({ op: Op.DISPOSE });
        engines.delete(msg.hostId);
      }
      return;
    }

    const hostId = msg.hostId ?? SOLO_HOST_ID;

    if (msg.op === Op.INIT) {
      const engine = new Engine();
      engines.set(hostId, engine);
      engine.dispatch(msg);
      return;
    }

    if (msg.op === Op.DISPOSE) {
      const engine = engines.get(hostId);
      if (engine) {
        engine.dispatch(msg);
        engines.delete(hostId);
      }
      return;
    }

    const engine = engines.get(hostId);
    if (!engine) {
      console.warn(`[fluxion-worker] no engine for hostId="${hostId}"`);
      return;
    }
    engine.dispatch(msg);
  } catch (err) {
    console.error("[fluxion-worker] dispatch error:", err);
  }
};

self.addEventListener("error", (e) => {
  console.error("[fluxion-worker] uncaught error:", e.message ?? e);
});

self.addEventListener("messageerror", (e) => {
  console.error("[fluxion-worker] message deserialization failed:", e);
});
