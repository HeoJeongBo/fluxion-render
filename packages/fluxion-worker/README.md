# @heojeongbo/fluxion-worker

[![npm](https://img.shields.io/npm/v/@heojeongbo/fluxion-worker)](https://www.npmjs.com/package/@heojeongbo/fluxion-worker)

Generic Web Worker pool and utilities. Zero dependencies, framework-agnostic.

Used internally by [`@heojeongbo/fluxion-render`](https://www.npmjs.com/package/@heojeongbo/fluxion-render) but designed to work standalone with any worker script.

```bash
npm install @heojeongbo/fluxion-worker
```

---

## Features

- **`WorkerPool`** — manages N workers, routes messages via `hostId`, least-busy scheduling
- **`WorkerHandle`** — thin wrapper over a single Worker with `hostId` filtering and optional pool integration
- **`defineWorker`** — worker-side helper that eliminates `self.onmessage` / `self.postMessage` boilerplate and auto-echoes `hostId`
- **`/react` subpath** — `useWorkerHandle`, `useWorkerPool`, `useWorkerRequest` hooks (React 18+, optional)

---

## Quick Start

### Worker script

```ts
// calc-worker.ts
import { defineWorker } from "@heojeongbo/fluxion-worker";

defineWorker<{ op: string; values: number[] }, { result: number }>(
  ({ op, values }, reply) => {
    const result = op === "sum" ? values.reduce((a, b) => a + b, 0) : 0;
    reply({ result });
  },
);
```

### Pool mode (multiple workers)

```ts
import { WorkerPool } from "@heojeongbo/fluxion-worker";

const pool = new WorkerPool({
  size: 4,
  workerFactory: () =>
    new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" }),
});

// One-liner: acquire → request → release
const result = await pool.dispatch<{ result: number }>(
  { op: "sum", values: [1, 2, 3] },
  { timeoutMs: 5000 },
);
console.log(result.result); // 6
```

### Standalone mode (single worker, no pool)

```ts
import { WorkerHandle } from "@heojeongbo/fluxion-worker";

const handle = new WorkerHandle(
  () => new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" }),
);

const result = await handle.request<{ result: number }>(
  { op: "sum", values: [1, 2, 3] },
  { timeoutMs: 5000 },
);
console.log(result.result); // 6

handle.dispose(); // stops the worker
```

---

## React

Import from the `/react` subpath. React 18+ is a peer dependency (optional).

### `useWorkerHandle` — single worker, lifecycle managed

```tsx
import { useWorkerHandle } from "@heojeongbo/fluxion-worker/react";
import { WorkerHandle } from "@heojeongbo/fluxion-worker";
import { useMemo, useState } from "react";

function Calc() {
  const handle = useWorkerHandle<{ op: string; values: number[] }>(
    () => new WorkerHandle(
      () => new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" })
    )
  );

  const [result, setResult] = useState<number | null>(null);

  const onClick = async () => {
    if (!handle) return; // null on first render
    const res = await handle.request<{ result: number }>(
      { op: "sum", values: [1, 2, 3] },
      { timeoutMs: 5000 },
    );
    setResult(res.result);
  };

  return <button onClick={onClick}>{result ?? "Calculate"}</button>;
}
```

The handle is created inside `useEffect` (null on first render) and disposed on unmount.
React StrictMode safe — double-invoke creates a fresh handle each time.

### `useWorkerPool` — pool, lifecycle managed

```tsx
import { useWorkerPool } from "@heojeongbo/fluxion-worker/react";

function Dashboard() {
  const pool = useWorkerPool<{ op: string; values: number[] }>({
    size: 4,
    workerFactory: () =>
      new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" }),
  });

  // pool is always non-null (synchronous initialization)
  const onClick = async () => {
    const result = await pool.dispatch<{ result: number }>(
      { op: "sum", values: [1, 2, 3] },
      { timeoutMs: 5000 },
    );
    console.log(result.result);
  };

  return <button onClick={onClick}>Calculate</button>;
}
```

### `useWorkerRequest` — declarative request/response

```tsx
import { useWorkerHandle, useWorkerRequest } from "@heojeongbo/fluxion-worker/react";
import { WorkerHandle } from "@heojeongbo/fluxion-worker";
import { useMemo } from "react";

type CalcMsg = { op: "sum"; values: number[] };
type CalcResult = { result: number };

function Calc({ values }: { values: number[] }) {
  const handle = useWorkerHandle<CalcMsg>(
    () => new WorkerHandle(
      () => new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" })
    )
  );

  // Stabilize msg with useMemo — inline objects re-trigger on every render.
  const msg = useMemo(() => ({ op: "sum" as const, values }), [values]);

  const { data, loading, error } = useWorkerRequest<CalcMsg, CalcResult>(handle, msg);

  if (loading) return <span>calculating…</span>;
  if (error) return <span>error: {error.message}</span>;
  return <span>result: {data?.result}</span>;
}
```

The in-flight request is automatically cancelled (via `AbortSignal`) when `handle` or `msg` changes, or when the component unmounts.

---

## API

### `defineWorker(handler)`

Registers a message handler in a worker script. Automatically echoes `hostId` back on every reply so pool/handle routing works.

```ts
defineWorker<TMsg, TResult>(
  handler: (msg: TMsg, reply: ReplyFn<TResult>) => void | Promise<void>
): void
```

- Call `reply` once for request/response, or multiple times for streaming
- Pass a second argument to `reply` to transfer `Transferable` objects (e.g. `ArrayBuffer`)
- Works with async handlers

```ts
// Streaming (multiple replies per message)
defineWorker<{ items: number[] }, { chunk: number[] }>(({ items }, reply) => {
  for (let i = 0; i < items.length; i += 100) {
    reply({ chunk: items.slice(i, i + 100) });
  }
});

// With Transferable (zero-copy ArrayBuffer transfer)
defineWorker<{ size: number }, { buffer: ArrayBuffer }>(({ size }, reply) => {
  const buffer = new ArrayBuffer(size);
  reply({ buffer }, [buffer]); // ownership transferred, no copy
});

// Async
defineWorker<{ url: string }, { data: string }>(async ({ url }, reply) => {
  const res = await fetch(url);
  reply({ data: await res.text() });
});
```

### `defineWorkerWithState(handler)`

Like `defineWorker`, but manages per-host state automatically.

```ts
defineWorkerWithState<TMsg, TResult, TState>(
  handler: (
    msg: TMsg,
    reply: ReplyFn<TResult>,
    ctx: HostContext<TState>  // { hostId, state }
  ) => TState | null | void | Promise<TState | null | void>
): void
```

- Return a new state value to update it for this host
- Return `null` to delete the state for this host (useful for session cleanup)
- Return `undefined` (or void) to leave state unchanged
- Works in standalone mode — messages without `hostId` share a `"__solo__"` slot

```ts
defineWorkerWithState<{ count: 1 }, { total: number }, { total: number }>(
  ({ }, reply, { state }) => {
    const s = state ?? { total: 0 };
    const next = { total: s.total + 1 };
    reply(next);
    return next; // update state
  }
);

// Reset state for a host:
defineWorkerWithState<{ reset?: boolean }, { total: number }, { total: number }>(
  ({ reset }, reply, { state }) => {
    if (reset) {
      reply({ total: 0 });
      return null; // delete state for this host
    }
    const s = state ?? { total: 0 };
    const next = { total: s.total + 1 };
    reply(next);
    return next;
  }
);
```

---

### `WorkerPool<TMsg>`

Manages a fixed set of workers. Distributes load via least-busy scheduling.

```ts
const pool = new WorkerPool<TMsg>({
  size?: number,               // default 4, clamped to [1, 16]
  workerFactory: () => Worker, // required
});
```

| Method | Description |
|--------|-------------|
| `pool.acquire()` | Returns a `WorkerHandle` bound to the least-busy worker |
| `pool.dispatch(msg, opts?, transfer?)` | One-liner: acquire → request → release |
| `pool.onError(callback)` | Global error handler for fire-and-forget errors. Returns an `off` fn |
| `pool.stats()` | `{ size, hostCounts, leastBusyIndex, totalActive }` |
| `pool.dispose()` | Terminates all workers and cleans up listeners |

**Global error handler** — catches errors from fire-and-forget `postMessage` calls that would otherwise be silently dropped:

```ts
const off = pool.onError((err, workerIndex) => {
  console.error(`Worker ${workerIndex} error:`, err.message);
});
// Later: off();
```

**Subclassing** — override `_createHandle` to return a custom handle type:

```ts
class MyPool extends WorkerPool<MyMsg> {
  protected override _createHandle(worker, index, hostId, onRelease) {
    return new MyHandle(worker, hostId, onRelease);
  }
  override acquire(): MyHandle {
    return super.acquire() as MyHandle;
  }
}
```

---

### `WorkerHandle<TMsg>`

Wraps a Worker and provides `hostId`-filtered messaging.

**Factory constructor** (handle owns the worker):
```ts
const handle = new WorkerHandle<TMsg>(
  () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
);
// dispose() stops the worker
```

**Injection constructor** (pool owns the worker):
```ts
const handle = new WorkerHandle<TMsg>(worker, hostId, onRelease?);
// dispose() releases back to pool
```

| Method | Description |
|--------|-------------|
| `handle.postMessage(msg, transfer?)` | Stamps `hostId` onto the message and sends it |
| `handle.request<TResult>(msg, opts?, transfer?)` | Send and await a single response |
| `handle.dispatch<TResult>(msg, opts?, transfer?)` | Alias for `request()` — consistent naming with pool |
| `handle.onMessage<TResult>(callback)` | Typed subscription; returns `off` fn |
| `handle.onError(callback)` | Error subscription; returns `off` fn |
| `handle.addEventListener(type, listener)` | Low-level; filters by `hostId` automatically |
| `handle.removeEventListener(type, listener)` | Unsubscribes |
| `handle.release()` | Returns to pool (no-op in standalone mode) |
| `handle.terminate()` | Stops the worker if the handle owns it; no-op if pool-backed |
| `handle.dispose()` | Smart cleanup — terminate in standalone, release in pool-backed |
| `handle.isTerminated` | `true` after `dispose()` / `terminate()` |
| `handle.hostId` | Unique identifier for this handle |

**`request()` with AbortSignal** — clean React `useEffect` integration:

```ts
useEffect(() => {
  const ctrl = new AbortController();
  handle.request<CalcResult>(msg, { timeoutMs: 5000, signal: ctrl.signal })
    .then(setResult)
    .catch((err) => {
      if (ctrl.signal.aborted) return; // ignore cleanup cancellations
      setError(err);
    });
  return () => ctrl.abort(); // cancel on unmount or dep change
}, [handle, msg]);
```

---

## License

MIT
