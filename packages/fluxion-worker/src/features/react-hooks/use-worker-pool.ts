import { type DependencyList, useEffect, useRef } from "react";
import { WorkerPool, type WorkerPoolOptions } from "../worker-pool/model/worker-pool";

/**
 * Creates a `WorkerPool` that lives for the component lifetime and is
 * disposed automatically on unmount.
 *
 * The pool is created synchronously (same render cycle), so the returned
 * value is always non-null — no null guard needed at the call site.
 *
 * The `opts` object is captured by ref on first render. Changing `opts`
 * fields after mount without changing `deps` does NOT recreate the pool.
 * Pass `deps` to recreate when worker configuration changes.
 *
 * React StrictMode safe — the effect cleanup disposes the pool on unmount,
 * and the next render synchronously creates a fresh one.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const pool = useWorkerPool<CalcMsg>({
 *     size: 4,
 *     workerFactory: () => new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" }),
 *   });
 *
 *   const onClick = async () => {
 *     const result = await pool.dispatch<CalcResult>({ op: "sum", values: [1, 2, 3] });
 *     console.log(result.value);
 *   };
 *
 *   return <button onClick={onClick}>Calculate</button>;
 * }
 * ```
 */
export function useWorkerPool<TMsg extends object>(
  opts: WorkerPoolOptions,
  deps: DependencyList = [],
): WorkerPool<TMsg> {
  const optsRef = useRef(opts);
  const poolRef = useRef<WorkerPool<TMsg> | null>(null);

  // Synchronous initialization — pool is ready on the same render cycle.
  if (!poolRef.current) {
    poolRef.current = new WorkerPool<TMsg>(optsRef.current);
  }

  useEffect(() => {
    return () => {
      poolRef.current?.dispose();
      poolRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return poolRef.current;
}
