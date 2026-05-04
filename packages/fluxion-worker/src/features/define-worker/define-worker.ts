/**
 * Inbound message shape: any object that may carry a `hostId` routed by WorkerHandle.
 * The worker script receives this after the main thread stamps hostId onto it.
 */
export type WorkerMsg<T extends object = object> = T & { hostId?: string };

/**
 * `reply` function passed to the handler.
 * Call it once or many times — each call posts a message back to the main thread
 * with `hostId` automatically echoed so WorkerHandle routing works.
 *
 * Optionally pass `transfer` to transfer ownership of Transferable objects
 * (e.g. ArrayBuffer, OffscreenCanvas) without copying.
 */
export type ReplyFn<TResult extends object> = (
  result: TResult,
  transfer?: Transferable[],
) => void;

/**
 * Register a handler for incoming worker messages.
 *
 * - `hostId` is automatically echoed back on every reply so pool/handle routing works.
 * - Call `reply` once for request/response, or multiple times for streaming results.
 * - Return a Promise (or use async) for async handlers — errors are caught and ignored
 *   (add your own try/catch inside the handler if you need error reporting).
 *
 * @example — simple request/response
 * ```ts
 * import { defineWorker } from "@heojeongbo/fluxion-worker";
 *
 * defineWorker<{ op: string; values: number[] }, { result: number }>(
 *   ({ op, values }, reply) => {
 *     const result = op === "sum" ? values.reduce((a, b) => a + b, 0) : 0;
 *     reply({ result });
 *   },
 * );
 * ```
 *
 * @example — streaming (multiple replies per message)
 * ```ts
 * defineWorker<{ items: number[] }, { chunk: number[] }>(
 *   ({ items }, reply) => {
 *     for (let i = 0; i < items.length; i += 100) {
 *       reply({ chunk: items.slice(i, i + 100) });
 *     }
 *   },
 * );
 * ```
 *
 * @example — with Transferable
 * ```ts
 * defineWorker<{ size: number }, { buffer: ArrayBuffer }>(
 *   ({ size }, reply) => {
 *     const buffer = new ArrayBuffer(size);
 *     reply({ buffer }, [buffer]);
 *   },
 * );
 * ```
 */
export function defineWorker<
  TMsg extends object,
  TResult extends object = object,
>(
  handler: (
    msg: WorkerMsg<TMsg>,
    reply: ReplyFn<TResult>,
  ) => void | Promise<void>,
): void {
  (self as unknown as Worker).onmessage = (
    evt: MessageEvent<WorkerMsg<TMsg>>,
  ) => {
    const msg = evt.data;
    const hostId = msg.hostId;

    const reply: ReplyFn<TResult> = (result, transfer) => {
      const out = hostId !== undefined ? { ...result, hostId } : result;
      if (transfer && transfer.length > 0) {
        (self as unknown as Worker).postMessage(out, transfer);
      } else {
        (self as unknown as Worker).postMessage(out);
      }
    };

    handler(msg, reply);
  };
}
