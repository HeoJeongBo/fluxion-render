import { useEffect, useRef, useState } from "react";

import type { FluxionWorkerPoolOptions } from "../../../features/worker-pool";
import { FluxionWorkerPool } from "../../../features/worker-pool";

/**
 * Creates a `FluxionWorkerPool` that lives for the lifetime of the component.
 * The pool is disposed automatically on unmount.
 *
 * Uses `useState` so that when the pool is recycled (e.g. React StrictMode
 * double-invoke), the parent re-renders and children receive the fresh pool
 * before attempting to acquire from it.
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
  const [pool, setPool] = useState(() => new FluxionWorkerPool(optsRef.current));

  useEffect(() => {
    const current = pool;
    return () => {
      current.dispose();
      // Recreate immediately so the next render (triggered by setPool) delivers
      // a live pool to children before they attempt acquire().
      setPool(new FluxionWorkerPool(optsRef.current));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return pool;
}
