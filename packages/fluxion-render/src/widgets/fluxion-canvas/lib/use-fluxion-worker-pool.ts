import { useEffect, useRef } from "react";

import type { FluxionWorkerPoolOptions } from "../../../features/worker-pool";
import { FluxionWorkerPool } from "../../../features/worker-pool";

/**
 * Creates a `FluxionWorkerPool` that lives for the lifetime of the component.
 * The pool is disposed automatically on unmount.
 *
 * Use this when you want a scoped pool (e.g. a specific page owns N workers)
 * instead of the module-level default pool.
 *
 * @example
 * const pool = useFluxionWorkerPool({ size: 4, workerFactory: () => new Worker(...) });
 * // Pass to each canvas:
 * <FluxionCanvas hostOptions={{ pool }} ... />
 */
export function useFluxionWorkerPool(
  opts: FluxionWorkerPoolOptions,
): FluxionWorkerPool {
  const optsRef = useRef(opts);
  const poolRef = useRef<FluxionWorkerPool | null>(null);

  if (!poolRef.current) {
    poolRef.current = new FluxionWorkerPool(optsRef.current);
  }

  useEffect(() => {
    return () => {
      poolRef.current?.dispose();
      poolRef.current = null;
    };
  }, []);

  return poolRef.current;
}
