import { Engine } from "../../features/engine";
import type { HostMsg } from "../../shared/protocol";

const engine = new Engine();

self.onmessage = (e: MessageEvent<HostMsg>) => {
  try {
    engine.dispatch(e.data);
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
