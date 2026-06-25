import type { WorkerPoolOptions } from "@heojeongbo/fluxion-worker";
import { WorkerPool } from "@heojeongbo/fluxion-worker";

import type { FluxionPoolStreamMsg, HostMsg } from "../../../shared/protocol";
import { FluxionWorkerHandle } from "./fluxion-worker-handle";

export type FluxionWorkerPoolOptions = WorkerPoolOptions;

export class FluxionWorkerPool extends WorkerPool<HostMsg> {
  private readonly _registry = new Map<string, FluxionWorkerHandle>();
  // Maps hostId → worker index so broadcastStream can group by worker, not by handle instance.
  private readonly _hostIndex = new Map<string, number>();

  protected override _createHandle(
    worker: Worker,
    index: number,
    hostId: string,
    onRelease: () => void,
  ): FluxionWorkerHandle {
    const handle = new FluxionWorkerHandle(worker, hostId, () => {
      this._registry.delete(hostId);
      this._hostIndex.delete(hostId);
      // Delegate to the base onRelease — it removes the handle from the pool's
      // `handles` Set AND decrements the busy counter. Calling `_release`
      // directly (the old behavior) skipped the Set cleanup, leaking a dead
      // handle on every mount/unmount cycle.
      onRelease();
    });
    this._registry.set(hostId, handle);
    this._hostIndex.set(hostId, index);
    return handle;
  }

  override dispose(): void {
    super.dispose();
    // Base dispose() doesn't know about these subclass maps; clear them so a
    // disposed pool holds no stale hostId→handle entries.
    this._registry.clear();
    this._hostIndex.clear();
  }

  override acquire(): FluxionWorkerHandle {
    return super.acquire() as FluxionWorkerHandle;
  }

  /** Returns true if the given hostId is currently registered in this pool. */
  hasHost(hostId: string): boolean {
    return this._registry.has(hostId);
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
    // A disposed pool has terminated workers — posting would throw / no-op.
    // (The caller-owned `buffer` is simply left for GC, not transferred.)
    if (this.isDisposed) return;
    // Group targets by worker index (not by handle instance — each acquire() returns
    // a new handle object even when backed by the same worker, so using the handle as
    // a Map key would create one group per host instead of one group per worker).
    const byWorkerIndex = new Map<
      number,
      { handle: FluxionWorkerHandle; targets: FluxionPoolStreamMsg["targets"] }
    >();
    for (const t of targets) {
      const h = this._registry.get(t.hostId);
      const idx = this._hostIndex.get(t.hostId);
      // Skip stale (unmounted) targets — a released/disposed host is removed
      // from the registry, so a mid-churn broadcast never posts to a dead
      // handle. (A whole-pool dispose is short-circuited above.)
      if (!h || idx === undefined) continue;
      let group = byWorkerIndex.get(idx);
      if (!group) {
        group = { handle: h, targets: [] };
        byWorkerIndex.set(idx, group);
      }
      group.targets.push(t);
    }

    // Send one pool-stream message per worker.
    // Last worker gets the original buffer (transfer); earlier ones get copies.
    const entries = [...byWorkerIndex.values()];
    entries.forEach(({ handle, targets: ts }, i) => {
      const buf = i < entries.length - 1 ? buffer.slice(0) : buffer;
      handle.emitPoolStream(ts, buf, length);
    });
  }
}
