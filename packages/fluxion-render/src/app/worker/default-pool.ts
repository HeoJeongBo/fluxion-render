import type { FluxionWorkerPoolOptions } from "../../features/worker-pool/model/fluxion-worker-pool";
import { FluxionWorkerPool } from "../../features/worker-pool/model/fluxion-worker-pool";

let _defaultPool: FluxionWorkerPool | null = null;

function makeDefaultFactory(): () => Worker {
  return () =>
    new Worker(new URL("./fluxion-worker.js", import.meta.url), {
      type: "module",
    });
}

export function getDefaultPool(): FluxionWorkerPool {
  if (!_defaultPool) {
    _defaultPool = new FluxionWorkerPool({
      size: 4,
      workerFactory: makeDefaultFactory(),
    });
  }
  return _defaultPool;
}

export function configureDefaultPool(
  opts: Omit<FluxionWorkerPoolOptions, "workerFactory"> &
    Partial<Pick<FluxionWorkerPoolOptions, "workerFactory">>,
): void {
  _defaultPool?.dispose();
  _defaultPool = new FluxionWorkerPool({
    workerFactory: makeDefaultFactory(),
    ...opts,
  });
}
