import { WorkerPool } from "@heojeongbo/fluxion-worker";
import type { WorkerPoolOptions } from "@heojeongbo/fluxion-worker";

import type { HostMsg } from "../../../shared/protocol";
import { FluxionWorkerHandle } from "./fluxion-worker-handle";

export type FluxionWorkerPoolOptions = WorkerPoolOptions;

export class FluxionWorkerPool extends WorkerPool<HostMsg> {
  protected override _createHandle(
    worker: Worker,
    index: number,
    hostId: string,
  ): FluxionWorkerHandle {
    return new FluxionWorkerHandle(worker, hostId, () => this._release(index));
  }

  override acquire(): FluxionWorkerHandle {
    return super.acquire() as FluxionWorkerHandle;
  }
}
