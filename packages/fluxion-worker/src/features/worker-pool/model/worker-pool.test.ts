import { describe, expect, it, vi } from "vitest";

import { WorkerHandle, WorkerPool } from "./worker-pool";

// ─── Test message type ───────────────────────────────────────────────────────

interface TestMsg {
  op: number;
  hostId?: string;
}

// ─── Fake Worker ────────────────────────────────────────────────────────────

interface FakeWorker {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _listeners: Map<string, Set<EventListener>>;
  _emit: (type: string, data: unknown) => void;
}

function makeFakeWorker(): FakeWorker {
  const _listeners = new Map<string, Set<EventListener>>();
  const addEventListener = vi.fn((type: string, fn: EventListener) => {
    if (!_listeners.has(type)) _listeners.set(type, new Set());
    _listeners.get(type)!.add(fn);
  });
  const removeEventListener = vi.fn((type: string, fn: EventListener) => {
    _listeners.get(type)?.delete(fn);
  });
  const _emit = (type: string, data: unknown) => {
    const evt = { data } as MessageEvent;
    for (const fn of _listeners.get(type) ?? []) fn(evt);
  };
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener,
    removeEventListener,
    _listeners,
    _emit,
  };
}

function makePool(size = 2): {
  pool: WorkerPool<TestMsg>;
  fakeWorkers: FakeWorker[];
} {
  const fakeWorkers: FakeWorker[] = [];
  const pool = new WorkerPool<TestMsg>({
    size,
    workerFactory: () => {
      const w = makeFakeWorker();
      fakeWorkers.push(w);
      return w as unknown as Worker;
    },
  });
  return { pool, fakeWorkers };
}

// ─── WorkerPool ──────────────────────────────────────────────────────────────

describe("WorkerPool", () => {
  describe("constructor", () => {
    it("creates the specified number of workers", () => {
      const { fakeWorkers } = makePool(3);
      expect(fakeWorkers).toHaveLength(3);
    });

    it("clamps size to minimum of 1", () => {
      const { fakeWorkers } = makePool(0);
      expect(fakeWorkers).toHaveLength(1);
    });

    it("clamps size to maximum of 16", () => {
      const { fakeWorkers } = makePool(100);
      expect(fakeWorkers).toHaveLength(16);
    });

    it("defaults to 4 workers when size is omitted", () => {
      const workers: unknown[] = [];
      const pool = new WorkerPool<TestMsg>({
        workerFactory: () => {
          const w = makeFakeWorker();
          workers.push(w);
          return w as unknown as Worker;
        },
      });
      expect(workers).toHaveLength(4);
      pool.dispose();
    });
  });

  describe("acquire", () => {
    it("returns a handle with a unique hostId", () => {
      const { pool } = makePool(2);
      const h1 = pool.acquire();
      const h2 = pool.acquire();
      expect(h1.hostId).not.toBe(h2.hostId);
      pool.dispose();
    });

    it("distributes hosts across workers via least-busy selection", () => {
      const { pool, fakeWorkers } = makePool(2);
      const handles = Array.from({ length: 4 }, () => pool.acquire());
      for (const h of handles) h.postMessage({ op: 1 });
      expect(fakeWorkers[0]!.postMessage).toHaveBeenCalledTimes(2);
      expect(fakeWorkers[1]!.postMessage).toHaveBeenCalledTimes(2);
      pool.dispose();
    });

    it("throws after the pool is disposed", () => {
      const { pool } = makePool(1);
      pool.dispose();
      expect(() => pool.acquire()).toThrow("disposed");
    });
  });

  describe("dispose", () => {
    it("terminates all workers", () => {
      const { pool, fakeWorkers } = makePool(3);
      pool.dispose();
      for (const w of fakeWorkers) {
        expect(w.terminate).toHaveBeenCalledOnce();
      }
    });

    it("is idempotent (double-dispose does not crash)", () => {
      const { pool, fakeWorkers } = makePool(1);
      pool.dispose();
      pool.dispose();
      expect(fakeWorkers[0]!.terminate).toHaveBeenCalledOnce();
    });

    it("removes all message listeners from underlying workers", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      handle.addEventListener("message", vi.fn());
      pool.dispose();
      expect(fakeWorkers[0]!.removeEventListener).toHaveBeenCalled();
    });
  });

  describe("_createHandle (subclass override)", () => {
    it("allows returning a custom handle from _createHandle", () => {
      class CustomHandle extends WorkerHandle<TestMsg> {
        readonly custom = true;
      }
      class CustomPool extends WorkerPool<TestMsg> {
        protected override _createHandle(
          worker: Worker,
          index: number,
          hostId: string,
        ): CustomHandle {
          return new CustomHandle(worker, hostId, () => this._release(index));
        }
        override acquire(): CustomHandle {
          return super.acquire() as CustomHandle;
        }
      }
      const workers: FakeWorker[] = [];
      const pool = new CustomPool({
        workerFactory: () => {
          const w = makeFakeWorker();
          workers.push(w);
          return w as unknown as Worker;
        },
      });
      const handle = pool.acquire();
      expect(handle.custom).toBe(true);
      pool.dispose();
    });
  });
});

// ─── WorkerHandle standalone (no pool) ──────────────────────────────────────

describe("WorkerHandle standalone (worker injection)", () => {
  it("can be instantiated with an existing Worker and explicit hostId", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(w as unknown as Worker, "my-host");
    expect(handle.hostId).toBe("my-host");
  });

  it("stamps the provided hostId onto messages", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(w as unknown as Worker, "my-host");
    handle.postMessage({ op: 1 });
    const [call] = w.postMessage.mock.calls;
    expect((call![0] as TestMsg).hostId).toBe("my-host");
  });

  it("release() is a no-op when no onRelease callback is provided", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(w as unknown as Worker, "my-host");
    expect(() => handle.release()).not.toThrow();
  });

  it("release() calls the provided onRelease callback", () => {
    const w = makeFakeWorker();
    const onRelease = vi.fn();
    const handle = new WorkerHandle<TestMsg>(w as unknown as Worker, "my-host", onRelease);
    handle.release();
    expect(onRelease).toHaveBeenCalledOnce();
  });

  it("filters messages by the given hostId", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(w as unknown as Worker, "my-host");
    const received: unknown[] = [];
    handle.addEventListener("message", (e) => received.push((e as MessageEvent).data));
    w._emit("message", { op: 1, hostId: "my-host" });
    w._emit("message", { op: 2, hostId: "other-host" });
    expect(received).toHaveLength(1);
    expect((received[0] as TestMsg).op).toBe(1);
  });

  it("terminate() is a no-op (pool-backed: pool owns the worker)", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(w as unknown as Worker, "my-host");
    handle.terminate();
    expect(w.terminate).not.toHaveBeenCalled();
  });
});

describe("WorkerHandle standalone (factory constructor)", () => {
  it("can be instantiated with a workerFactory", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    expect(handle.hostId).toMatch(/^standalone-\d+$/);
  });

  it("generates unique hostIds across instances", () => {
    const h1 = new WorkerHandle<TestMsg>(() => makeFakeWorker() as unknown as Worker);
    const h2 = new WorkerHandle<TestMsg>(() => makeFakeWorker() as unknown as Worker);
    expect(h1.hostId).not.toBe(h2.hostId);
    h1.terminate();
    h2.terminate();
  });

  it("stamps the auto-generated hostId onto messages", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    handle.postMessage({ op: 1 });
    const [call] = w.postMessage.mock.calls;
    expect((call![0] as TestMsg).hostId).toBe(handle.hostId);
  });

  it("terminate() calls worker.terminate() and removes listeners", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    const cb = vi.fn();
    handle.addEventListener("message", cb);
    handle.terminate();
    expect(w.terminate).toHaveBeenCalledOnce();
    // listener is cleaned up — emitting after terminate should not call cb
    w._emit("message", { op: 1, hostId: handle.hostId });
    expect(cb).not.toHaveBeenCalled();
  });

  it("postMessage is a no-op after terminate()", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    handle.terminate();
    handle.postMessage({ op: 1 });
    expect(w.postMessage).not.toHaveBeenCalled();
  });

  it("release() is a no-op (no pool)", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    expect(() => handle.release()).not.toThrow();
    handle.terminate();
  });
});

// ─── WorkerHandle ────────────────────────────────────────────────────────────

describe("WorkerHandle", () => {
  describe("postMessage", () => {
    it("stamps hostId onto the message", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      handle.postMessage({ op: 42 });
      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      expect((call![0] as TestMsg).hostId).toBe(handle.hostId);
      pool.dispose();
    });

    it("forwards non-empty transfer array", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const buf = new ArrayBuffer(8);
      handle.postMessage({ op: 1 }, [buf]);
      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      expect(call![1]).toEqual([buf]);
      pool.dispose();
    });

    it("does not pass transfer when array is empty", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      handle.postMessage({ op: 1 }, []);
      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      expect(call![1]).toBeUndefined();
      pool.dispose();
    });

    it("does not pass transfer when omitted", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      handle.postMessage({ op: 1 });
      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      expect(call![1]).toBeUndefined();
      pool.dispose();
    });

    it("is a no-op after _markTerminated", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      pool.dispose();
      const callsBefore = fakeWorkers[0]!.postMessage.mock.calls.length;
      handle.postMessage({ op: 99 });
      expect(fakeWorkers[0]!.postMessage.mock.calls).toHaveLength(callsBefore);
    });
  });

  describe("release", () => {
    it("decrements the pool busy counter", () => {
      const { pool } = makePool(1);
      const h1 = pool.acquire();
      const h2 = pool.acquire();
      // Both on worker 0 — count is 2
      h1.release();
      // Count is 1 — acquiring again still goes to worker 0 (count 2 again)
      const h3 = pool.acquire();
      expect(h3.hostId).not.toBe(h1.hostId);
      pool.dispose();
    });

    it("does not go below zero on repeated release", () => {
      const { pool } = makePool(1);
      const handle = pool.acquire();
      handle.release();
      handle.release(); // second release — no-op, count stays at 0
      expect(() => pool.acquire()).not.toThrow();
      pool.dispose();
    });
  });

  describe("terminate", () => {
    it("is a no-op (pool owns worker lifetime)", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      handle.terminate();
      expect(fakeWorkers[0]!.terminate).not.toHaveBeenCalled();
      pool.dispose();
    });
  });

  describe("addEventListener / removeEventListener", () => {
    it("filters messages by hostId", () => {
      const { pool, fakeWorkers } = makePool(1);
      const h1 = pool.acquire();
      const h2 = pool.acquire();
      const received1: unknown[] = [];
      const received2: unknown[] = [];
      h1.addEventListener("message", (e) =>
        received1.push((e as MessageEvent).data),
      );
      h2.addEventListener("message", (e) =>
        received2.push((e as MessageEvent).data),
      );
      fakeWorkers[0]!._emit("message", { op: 1, hostId: h1.hostId });
      fakeWorkers[0]!._emit("message", { op: 2, hostId: h2.hostId });
      fakeWorkers[0]!._emit("message", { op: 3, hostId: "unknown" });
      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      pool.dispose();
    });

    it("does not deliver messages that lack a hostId field", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const received: unknown[] = [];
      handle.addEventListener("message", (e) =>
        received.push((e as MessageEvent).data),
      );
      fakeWorkers[0]!._emit("message", { op: 1 }); // no hostId
      fakeWorkers[0]!._emit("message", null);
      fakeWorkers[0]!._emit("message", "string");
      expect(received).toHaveLength(0);
      pool.dispose();
    });

    it("removeEventListener stops delivery", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const received: unknown[] = [];
      const listener = (e: Event) =>
        received.push((e as MessageEvent).data);
      handle.addEventListener("message", listener);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(received).toHaveLength(1);
      handle.removeEventListener("message", listener);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(received).toHaveLength(1);
      pool.dispose();
    });

    it("removeEventListener is a no-op for unknown listener", () => {
      const { pool } = makePool(1);
      const handle = pool.acquire();
      expect(() => handle.removeEventListener("message", () => {})).not.toThrow();
      pool.dispose();
    });

    it("removeEventListener cleans up type entry when last listener removed", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const listener = vi.fn();
      handle.addEventListener("message", listener);
      handle.removeEventListener("message", listener);
      expect(fakeWorkers[0]!._listeners.get("message")?.size ?? 0).toBe(0);
      pool.dispose();
    });

    it("removeEventListener keeps type entry when other listeners remain", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const a = vi.fn();
      const b = vi.fn();
      handle.addEventListener("message", a);
      handle.addEventListener("message", b);
      handle.removeEventListener("message", a);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(b).toHaveBeenCalledOnce();
      expect(a).not.toHaveBeenCalled();
      pool.dispose();
    });

    it("multiple listeners on the same type all receive messages", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const a = vi.fn();
      const b = vi.fn();
      handle.addEventListener("message", a);
      handle.addEventListener("message", b);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
      pool.dispose();
    });
  });
});
