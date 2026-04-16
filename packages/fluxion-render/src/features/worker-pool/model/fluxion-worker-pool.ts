import type { HostMsg, InitMsg, PoolDisposeMsg, PoolInitMsg } from "../../../shared/protocol";
import { Op } from "../../../shared/protocol";

export interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL("./fluxion-worker.js", import.meta.url), {
    type: "module",
  });
}

export interface FluxionWorkerPoolOptions {
  /** Number of workers to maintain. Default: 4. Clamped to [1, 16]. */
  size?: number;
  /**
   * Custom worker factory. Required in bundler environments that don't support
   * `new Worker(new URL(...))` resolution.
   */
  workerFactory?: () => Worker;
}

class PooledWorkerHandle implements WorkerLike {
  private _terminated = false;

  constructor(
    private readonly pool: FluxionWorkerPool,
    private readonly worker: Worker,
    private readonly workerIndex: number,
    readonly hostId: string,
  ) {}

  postMessage(msg: HostMsg, transfer?: Transferable[]): void {
    if (this._terminated) return;

    if (msg.op === Op.INIT) {
      const initMsg = msg as InitMsg;
      const poolMsg: PoolInitMsg = {
        op: Op.POOL_INIT,
        hostId: this.hostId,
        canvas: initMsg.canvas,
        width: initMsg.width,
        height: initMsg.height,
        dpr: initMsg.dpr,
        bgColor: initMsg.bgColor,
      };
      this.worker.postMessage(poolMsg, transfer ?? []);
      return;
    }

    if (msg.op === Op.DISPOSE) {
      const poolMsg: PoolDisposeMsg = { op: Op.POOL_DISPOSE, hostId: this.hostId };
      this.worker.postMessage(poolMsg);
      this.pool._release(this.workerIndex);
      return;
    }

    const stamped = { ...msg, hostId: this.hostId };
    if (transfer && transfer.length) {
      this.worker.postMessage(stamped, transfer);
    } else {
      this.worker.postMessage(stamped);
    }
  }

  terminate(): void {
    // Pool owns the worker lifetime — this is intentionally a no-op.
  }

  _markTerminated(): void {
    this._terminated = true;
  }
}

export class FluxionWorkerPool {
  private readonly workers: Worker[];
  private readonly hostCounts: number[];
  private readonly handles: PooledWorkerHandle[] = [];
  private _seq = 0;
  private _disposed = false;

  constructor(opts: FluxionWorkerPoolOptions = {}) {
    const size = Math.max(1, Math.min(opts.size ?? 4, 16));
    const factory = opts.workerFactory ?? defaultWorkerFactory;
    this.workers = Array.from({ length: size }, () => factory());
    this.hostCounts = new Array<number>(size).fill(0);
  }

  acquire(): PooledWorkerHandle {
    if (this._disposed) {
      throw new Error("fluxion-render: FluxionWorkerPool has been disposed");
    }
    const index = this._leastBusyIndex();
    this.hostCounts[index]++;
    const hostId = `host-${++this._seq}`;
    const handle = new PooledWorkerHandle(this, this.workers[index]!, index, hostId);
    this.handles.push(handle);
    return handle;
  }

  _release(workerIndex: number): void {
    this.hostCounts[workerIndex] = Math.max(0, (this.hostCounts[workerIndex] ?? 1) - 1);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const handle of this.handles) {
      handle._markTerminated();
    }
    for (const worker of this.workers) {
      worker.terminate();
    }
  }

  private _leastBusyIndex(): number {
    let minIdx = 0;
    let minCount = this.hostCounts[0] ?? 0;
    for (let i = 1; i < this.hostCounts.length; i++) {
      const count = this.hostCounts[i] ?? 0;
      if (count < minCount) {
        minCount = count;
        minIdx = i;
      }
    }
    return minIdx;
  }
}
