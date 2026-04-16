import { FluxionWorkerPool, type FluxionWorkerPoolOptions } from "./fluxion-worker-pool";

let _defaultPool: FluxionWorkerPool | null = null;

/**
 * Returns the module-level default worker pool, creating it lazily on first call.
 * All `FluxionHost` instances use this pool unless explicitly given another pool
 * or a custom `workerFactory`.
 */
export function getDefaultPool(): FluxionWorkerPool {
  if (!_defaultPool) {
    _defaultPool = new FluxionWorkerPool({ size: 4 });
  }
  return _defaultPool;
}

/**
 * Override the default pool configuration. If a pool already exists it will be
 * disposed and replaced. Call this **before** creating any `FluxionHost`.
 *
 * @example
 * configureDefaultPool({ size: 2 }); // use only 2 workers
 */
export function configureDefaultPool(opts: FluxionWorkerPoolOptions): void {
  _defaultPool?.dispose();
  _defaultPool = new FluxionWorkerPool(opts);
}
