import { WorkerPool } from "@heojeongbo/fluxion-worker";
import type { WorkerPoolOptions } from "@heojeongbo/fluxion-worker";

import type { FluxionPoolStreamMsg, HostMsg } from "../../../shared/protocol";
import { FluxionWorkerHandle } from "./fluxion-worker-handle";

export type FluxionWorkerPoolOptions = WorkerPoolOptions;

export class FluxionWorkerPool extends WorkerPool<HostMsg> {
  private readonly _registry = new Map<string, FluxionWorkerHandle>();

  protected override _createHandle(
    worker: Worker,
    index: number,
    hostId: string,
  ): FluxionWorkerHandle {
    const handle = new FluxionWorkerHandle(worker, hostId, () => {
      this._registry.delete(hostId);
      this._release(index);
    });
    this._registry.set(hostId, handle);
    return handle;
  }

  override acquire(): FluxionWorkerHandle {
    return super.acquire() as FluxionWorkerHandle;
  }

  /**
   * Fan-out one buffer to multiple Engine instances, grouped by worker (zero-copy).
   *
   * With size=1 pool: 1 worker → 1 transfer (true zero-copy, 1 parse).
   * With size>1 pool: W workers → W-1 copies + 1 transfer (buffer.slice per worker
   * except the last). Use size=1 when parse count matters most.
   *
   * After this call, `buffer` is detached — do not read it again.
   */
  broadcastStream(
    targets: FluxionPoolStreamMsg["targets"],
    buffer: ArrayBuffer,
    length: number,
  ): void {
    // Group targets by the handle they're bound to (= by worker)
    const byHandle = new Map<FluxionWorkerHandle, FluxionPoolStreamMsg["targets"]>();
    for (const t of targets) {
      const h = this._registry.get(t.hostId);
      if (!h) continue;
      let group = byHandle.get(h);
      if (!group) { group = []; byHandle.set(h, group); }
      group.push(t);
    }

    // Send one pool-stream message per worker.
    // Last worker gets the original buffer (transfer); earlier ones get copies.
    const entries = [...byHandle.entries()];
    entries.forEach(([h, ts], i) => {
      const buf = i < entries.length - 1 ? buffer.slice(0) : buffer;
      h.emitPoolStream(ts, buf, length);
    });
  }
}
