# @heojeongbo/fluxion-worker

Generic Web Worker pool and utilities. Zero dependencies, framework-agnostic.

Used internally by [`@heojeongbo/fluxion-render`](https://www.npmjs.com/package/@heojeongbo/fluxion-render) but designed to work standalone with any worker script.

```
npm install @heojeongbo/fluxion-worker
```

---

## Features

- **`WorkerPool`** — manages N workers, routes messages via `hostId`, least-busy scheduling
- **`WorkerHandle`** — thin wrapper over a single Worker with `hostId` filtering and optional pool integration
- **`defineWorker`** — worker-side helper that eliminates `self.onmessage` / `self.postMessage` boilerplate and auto-echoes `hostId`

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

const handle = pool.acquire();
handle.addEventListener("message", (evt) => {
  console.log(evt.data.result);
  handle.release(); // return to pool
});
handle.postMessage({ op: "sum", values: [1, 2, 3] });
```

### Standalone mode (single worker, no pool)

```ts
import { WorkerHandle } from "@heojeongbo/fluxion-worker";

const handle = new WorkerHandle(
  () => new Worker(new URL("./calc-worker.ts", import.meta.url), { type: "module" }),
);

handle.addEventListener("message", (evt) => {
  console.log(evt.data.result);
});
handle.postMessage({ op: "sum", values: [1, 2, 3] });

// When done:
handle.terminate(); // stops the worker automatically
```

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

// With Transferable
defineWorker<{ size: number }, { buffer: ArrayBuffer }>(({ size }, reply) => {
  const buffer = new ArrayBuffer(size);
  reply({ buffer }, [buffer]);
});

// Async
defineWorker<{ url: string }, { data: string }>(async ({ url }, reply) => {
  const res = await fetch(url);
  reply({ data: await res.text() });
});
```

---

### `WorkerPool<TMsg>`

Manages a fixed set of workers. Distributes load via least-busy scheduling.

```ts
const pool = new WorkerPool<TMsg>({
  size?: number,           // default 4, clamped to [1, 16]
  workerFactory: () => Worker, // required
});
```

| Method | Description |
|--------|-------------|
| `pool.acquire()` | Returns a `WorkerHandle` bound to the least-busy worker |
| `pool.dispose()` | Terminates all workers and cleans up listeners |

**Subclassing** — override `_createHandle` to return a custom handle type:

```ts
class MyPool extends WorkerPool<MyMsg> {
  protected override _createHandle(worker, index, hostId) {
    return new MyHandle(worker, hostId, () => this._release(index));
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
// terminate() stops the worker
```

**Injection constructor** (pool owns the worker):
```ts
const handle = new WorkerHandle<TMsg>(worker, hostId, onRelease?);
// terminate() is a no-op — pool manages the worker lifetime
```

| Method | Description |
|--------|-------------|
| `handle.postMessage(msg, transfer?)` | Stamps `hostId` onto the message and sends it |
| `handle.addEventListener(type, listener)` | Subscribes — filters by `hostId` automatically |
| `handle.removeEventListener(type, listener)` | Unsubscribes |
| `handle.release()` | Returns the handle to the pool (no-op in standalone mode) |
| `handle.terminate()` | Stops the worker if the handle owns it; no-op if pool-backed |
| `handle.hostId` | The unique identifier for this handle |

---

## React (with `useEffect`)

```tsx
import { WorkerHandle } from "@heojeongbo/fluxion-worker";
import { useEffect, useRef } from "react";

function MyComponent() {
  const handleRef = useRef<WorkerHandle<MyMsg> | null>(null);

  useEffect(() => {
    handleRef.current = new WorkerHandle(
      () => new Worker(new URL("./my-worker.ts", import.meta.url), { type: "module" })
    );
    return () => {
      handleRef.current?.terminate();
      handleRef.current = null;
    };
  }, []);
}
```

---

## License

MIT
