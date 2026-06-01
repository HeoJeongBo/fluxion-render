/**
 * "@heojeongbo/fluxion-render/worker" sub-entry.
 *
 * Import this inside your custom worker script to get access to `Engine`
 * (for dispatching HostMsg and calling `pushRaw`) plus all the
 * `defineWorker*` helpers from fluxion-worker.
 *
 * @example
 * ```ts
 * // my-sensor-worker.ts
 * import { Engine, defineWorkerWithState } from "@heojeongbo/fluxion-render/worker";
 * import type { HostMsg, StreamDataMsg } from "@heojeongbo/fluxion-render/worker";
 *
 * defineWorkerWithState<HostMsg, object, Engine, StreamDataMsg>(
 *   (msg, _reply, ctx) => {
 *     const engine = ctx.state ?? new Engine();
 *     engine.dispatch(msg as HostMsg);
 *     return engine;
 *   },
 *   (msg, _push, ctx) => {
 *     const engine = ctx.state;
 *     if (!engine) return;
 *     const arr = new Float32Array(msg.buffer, 0, msg.length);
 *     engine.pushRaw(msg.id, arr);
 *   },
 * );
 * ```
 */
export { Engine } from "./features/engine";
export { Op } from "./shared/protocol";
export type {
  HostMsg,
  LayerKind,
  DType,
  StreamDataMsg,
} from "./shared/protocol";
export {
  defineWorker,
  defineWorkerWithState,
} from "@heojeongbo/fluxion-worker";
export type {
  HostContext,
  WorkerMsg,
  PushFn,
  ReplyFn,
  FluxionMode,
} from "@heojeongbo/fluxion-worker";
