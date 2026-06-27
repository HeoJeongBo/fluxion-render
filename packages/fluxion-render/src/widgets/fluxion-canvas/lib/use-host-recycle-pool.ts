import { useEffect, useRef, useState } from "react";

import {
  createHostRecyclePool,
  type HostRecyclePool,
  type HostRecyclePoolOptions,
} from "../../../features/host";

/**
 * Creates a {@link HostRecyclePool} that lives for the lifetime of the
 * component and is disposed (tearing down every warm host) on unmount. Pass it
 * to each `<FluxionCanvas recyclePool={pool} />` whose mounts/unmounts you want
 * recycled instead of re-created — the big CPU win for virtualized lists,
 * accordions, and grids that remount.
 *
 * Mirrors {@link useFluxionWorkerPool}: `useState` so a StrictMode double-invoke
 * recreates the pool and re-renders children with the live one before they
 * acquire. Charts sharing a recycle pool must use compatible host options
 * (same worker pool, axis-canvas presence, etc.) — see `keyFor`; mismatches
 * simply fall back to a cold create.
 *
 * @example
 * const recyclePool = useHostRecyclePool({ max: 16 });
 * <FluxionCanvas recyclePool={recyclePool} hostOptions={{ pool }} ... />
 */
export function useHostRecyclePool(opts: HostRecyclePoolOptions = {}): HostRecyclePool {
  const optsRef = useRef(opts);
  const [pool, setPool] = useState(() => createHostRecyclePool(optsRef.current));

  useEffect(() => {
    const current = pool;
    return () => {
      current.dispose();
      // Recreate immediately so the next render delivers a live pool to children
      // before they attempt acquire() (StrictMode-safe, mirrors the worker pool).
      setPool(createHostRecyclePool(optsRef.current));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return pool;
}
