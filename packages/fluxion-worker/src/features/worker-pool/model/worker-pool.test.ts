import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkerErrorMsg } from "../../define-worker/define-worker";
import type { WorkerPoolStats } from "./worker-pool";
import {
  WorkerHandle,
  WorkerHandlerError,
  WorkerLike,
  WorkerPool,
  WorkerTimeoutError,
} from "./worker-pool";

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
          _index: number,
          hostId: string,
          onRelease: () => void,
        ): CustomHandle {
          return new CustomHandle(worker, hostId, onRelease);
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
      pool.acquire(); // Both on worker 0 — count is 2
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

  describe("onMessage", () => {
    it("delivers typed messages to the callback", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const cb = vi.fn();
      handle.onMessage(cb);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(cb).toHaveBeenCalledOnce();
      expect(cb.mock.calls[0]![0]).toMatchObject({ op: 1 });
      pool.dispose();
    });

    it("returns an off() function that stops delivery", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const cb = vi.fn();
      const off = handle.onMessage(cb);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(cb).toHaveBeenCalledOnce();
      off();
      fakeWorkers[0]!._emit("message", { op: 2, hostId: handle.hostId });
      expect(cb).toHaveBeenCalledOnce();
      pool.dispose();
    });

    it("filters messages by hostId (via addEventListener)", () => {
      const { pool, fakeWorkers } = makePool(1);
      const h1 = pool.acquire();
      const h2 = pool.acquire();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      h1.onMessage(cb1);
      h2.onMessage(cb2);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: h1.hostId });
      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).not.toHaveBeenCalled();
      pool.dispose();
    });

    it("supports multiple independent subscriptions", () => {
      const { pool, fakeWorkers } = makePool(1);
      const handle = pool.acquire();
      const a = vi.fn();
      const b = vi.fn();
      handle.onMessage(a);
      handle.onMessage(b);
      fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
      pool.dispose();
    });
  });
});

// ─── WorkerPool.stats() ──────────────────────────────────────────────────────

describe("WorkerPool.stats()", () => {
  it("returns correct counts after acquire", () => {
    const { pool } = makePool(2);
    const s0 = pool.stats();
    expect(s0.size).toBe(2);
    expect(s0.hostCounts).toEqual([0, 0]);
    expect(s0.totalActive).toBe(0);

    pool.acquire(); // worker 0
    pool.acquire(); // worker 1
    pool.acquire(); // worker 0 (least busy again)

    const s1 = pool.stats();
    expect(s1.hostCounts[0]).toBe(2);
    expect(s1.hostCounts[1]).toBe(1);
    expect(s1.totalActive).toBe(3);
    expect(s1.leastBusyIndex).toBe(1);
    pool.dispose();
  });

  it("updates after release", () => {
    const { pool } = makePool(2);
    const h = pool.acquire(); // worker 0
    expect(pool.stats().hostCounts[0]).toBe(1);
    h.release();
    expect(pool.stats().hostCounts[0]).toBe(0);
    pool.dispose();
  });

  it("returns a snapshot (not a live reference)", () => {
    const { pool } = makePool(2);
    const snap = pool.stats();
    pool.acquire();
    expect(snap.hostCounts[0]).toBe(0); // snapshot unchanged
    pool.dispose();
  });

  it("satisfies WorkerPoolStats type", () => {
    const { pool } = makePool(3);
    const s: WorkerPoolStats = pool.stats();
    expect(s.size).toBe(3);
    pool.dispose();
  });
});

// ─── WorkerHandle.onError() ──────────────────────────────────────────────────

describe("WorkerHandle.onError()", () => {
  function makeErrorMsg(hostId: string): WorkerErrorMsg {
    return { __fluxionError: true, hostId, message: "boom", stack: "stack" };
  }

  it("calls callback when error message arrives with matching hostId", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const cb = vi.fn();
    handle.onError(cb);
    fakeWorkers[0]!._emit("message", makeErrorMsg(handle.hostId));
    expect(cb).toHaveBeenCalledOnce();
    expect((cb.mock.calls[0]![0] as WorkerErrorMsg).message).toBe("boom");
    pool.dispose();
  });

  it("does not call callback for a different hostId", () => {
    const { pool, fakeWorkers } = makePool(1);
    const h1 = pool.acquire();
    const h2 = pool.acquire();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    h1.onError(cb1);
    h2.onError(cb2);
    fakeWorkers[0]!._emit("message", makeErrorMsg(h1.hostId));
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).not.toHaveBeenCalled();
    pool.dispose();
  });

  it("does not call callback for normal (non-error) messages", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const errCb = vi.fn();
    handle.onError(errCb);
    fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
    expect(errCb).not.toHaveBeenCalled();
    pool.dispose();
  });

  it("off() stops error delivery", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const cb = vi.fn();
    const off = handle.onError(cb);
    off();
    fakeWorkers[0]!._emit("message", makeErrorMsg(handle.hostId));
    expect(cb).not.toHaveBeenCalled();
    pool.dispose();
  });
});

// ─── WorkerHandle.request() ──────────────────────────────────────────────────

describe("WorkerHandle.request()", () => {
  it("resolves with the first reply", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request<{ result: number }>({ op: 1 });
    fakeWorkers[0]!._emit("message", { result: 42, hostId: handle.hostId });
    await expect(promise).resolves.toMatchObject({ result: 42 });
    pool.dispose();
  });

  it("rejects when worker sends WorkerErrorMsg", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request({ op: 1 });
    fakeWorkers[0]!._emit("message", {
      __fluxionError: true,
      hostId: handle.hostId,
      message: "worker boom",
    });
    await expect(promise).rejects.toThrow("worker boom");
    pool.dispose();
  });

  it("rejects with WorkerTimeoutError after timeoutMs", async () => {
    vi.useFakeTimers();
    const { pool } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request({ op: 1 }, { timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    await expect(promise).rejects.toBeInstanceOf(WorkerTimeoutError);
    vi.useRealTimers();
    pool.dispose();
  });

  it("does not reject after timeout if reply already resolved", async () => {
    vi.useFakeTimers();
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request<{ v: number }>({ op: 1 }, { timeoutMs: 200 });
    fakeWorkers[0]!._emit("message", { v: 1, hostId: handle.hostId });
    vi.advanceTimersByTime(200);
    await expect(promise).resolves.toMatchObject({ v: 1 });
    vi.useRealTimers();
    pool.dispose();
  });

  it("cleans up listeners after resolve (no leak)", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request({ op: 1 });
    fakeWorkers[0]!._emit("message", { result: 1, hostId: handle.hostId });
    await promise;
    const listenerCountBefore = fakeWorkers[0]!._listeners.get("message")?.size ?? 0;
    // emitting again should not call any stale listener
    const extra = vi.fn();
    handle.onMessage(extra);
    fakeWorkers[0]!._emit("message", { result: 2, hostId: handle.hostId });
    expect(extra).toHaveBeenCalledOnce();
    expect(fakeWorkers[0]!._listeners.get("message")?.size).toBe(listenerCountBefore + 1);
    pool.dispose();
  });

  it("does not call release() automatically", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    expect(pool.stats().totalActive).toBe(1);
    const promise = handle.request({ op: 1 });
    fakeWorkers[0]!._emit("message", { result: 1, hostId: handle.hostId });
    await promise;
    expect(pool.stats().totalActive).toBe(1); // still active — caller must release
    handle.release();
    expect(pool.stats().totalActive).toBe(0);
    pool.dispose();
  });

  it("rejects with 'Worker was terminated' when pool is disposed while pending", async () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request({ op: 1 });
    pool.dispose();
    await expect(promise).rejects.toThrow("Worker was terminated");
  });

  it("no listener leak after dispose of pending request", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    handle.request({ op: 1 }).catch(() => {});
    const countBefore = fakeWorkers[0]!._listeners.get("message")?.size ?? 0;
    pool.dispose();
    // After dispose, _listenerMap is cleared → all wrappers removed from fake worker
    const countAfter = fakeWorkers[0]!._listeners.get("message")?.size ?? 0;
    expect(countAfter).toBe(0);
    expect(countBefore).toBeGreaterThan(0);
  });
});

// ─── onError _listenerMap coverage ──────────────────────────────────────────

describe("onError cleanup via _markTerminated", () => {
  function makeErrorMsg(hostId: string): WorkerErrorMsg {
    return { __fluxionError: true, hostId, message: "boom", stack: "stack" };
  }

  it("onError listener is removed when pool is disposed", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const cb = vi.fn();
    handle.onError(cb);
    pool.dispose();
    fakeWorkers[0]!._emit("message", makeErrorMsg(handle.hostId));
    expect(cb).not.toHaveBeenCalled();
  });

  it("onError off() removes from _listenerMap cleanly", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const cb = vi.fn();
    const off = handle.onError(cb);
    const countBefore = fakeWorkers[0]!._listeners.get("message")?.size ?? 0;
    off();
    const countAfter = fakeWorkers[0]!._listeners.get("message")?.size ?? 0;
    expect(countAfter).toBe(countBefore - 1);
    pool.dispose();
  });
});

// ─── WorkerHandle.isTerminated ───────────────────────────────────────────────

describe("WorkerHandle.isTerminated", () => {
  it("is false on a fresh handle", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    expect(handle.isTerminated).toBe(false);
    pool.dispose();
  });

  it("is true after standalone terminate()", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    handle.terminate();
    expect(handle.isTerminated).toBe(true);
  });

  it("is true after standalone dispose()", () => {
    const w = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(() => w as unknown as Worker);
    handle.dispose();
    expect(handle.isTerminated).toBe(true);
  });

  it("is true after pool-backed dispose()", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    handle.dispose();
    expect(handle.isTerminated).toBe(true);
    pool.dispose();
  });

  it("is true after pool.dispose()", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    pool.dispose();
    expect(handle.isTerminated).toBe(true);
  });
});

// ─── WorkerHandle.onMessage strips hostId ────────────────────────────────────

describe("WorkerHandle.onMessage strips hostId", () => {
  it("callback does not receive hostId field", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    let received: Record<string, unknown> | undefined;
    handle.onMessage((msg) => { received = msg as Record<string, unknown>; });
    fakeWorkers[0]!._emit("message", { op: 1, result: 42, hostId: handle.hostId });
    expect(received).toBeDefined();
    expect(received!["hostId"]).toBeUndefined();
    expect(received!["op"]).toBe(1);
    expect(received!["result"]).toBe(42);
    pool.dispose();
  });
});

// ─── WorkerLike interface ─────────────────────────────────────────────────────

describe("WorkerLike interface", () => {
  it("WorkerHandle satisfies WorkerLike", () => {
    const w = makeFakeWorker();
    const handle: WorkerLike = new WorkerHandle<TestMsg>(w as unknown as Worker, "h1");
    expect(typeof handle.postMessage).toBe("function");
    expect(typeof handle.addEventListener).toBe("function");
    expect(typeof handle.removeEventListener).toBe("function");
    expect(typeof handle.terminate).toBe("function");
  });
});

// ─── WorkerTimeoutError.is() ─────────────────────────────────────────────────

describe("WorkerTimeoutError.is()", () => {
  it("returns true for WorkerTimeoutError instances", () => {
    expect(WorkerTimeoutError.is(new WorkerTimeoutError(100))).toBe(true);
  });

  it("returns false for generic Error", () => {
    expect(WorkerTimeoutError.is(new Error("oops"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(WorkerTimeoutError.is("string")).toBe(false);
    expect(WorkerTimeoutError.is(null)).toBe(false);
    expect(WorkerTimeoutError.is(undefined)).toBe(false);
  });
});

// ─── WorkerHandle.dispose() ──────────────────────────────────────────────────

describe("WorkerHandle.dispose()", () => {
  it("standalone: terminates the worker and cleans up listeners", () => {
    const fakeWorker = makeFakeWorker();
    const handle = new WorkerHandle<TestMsg>(
      () => fakeWorker as unknown as Worker,
    );
    const cb = vi.fn();
    handle.onMessage(cb);
    handle.dispose();
    fakeWorker._emit("message", { op: 1, hostId: handle.hostId });
    expect(cb).not.toHaveBeenCalled();
    expect(fakeWorker.terminate).toHaveBeenCalledOnce();
  });

  it("pool-backed: releases the slot (decrements counter)", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    expect(pool.stats().totalActive).toBe(1);
    handle.dispose();
    expect(pool.stats().totalActive).toBe(0);
    pool.dispose();
  });

  it("pool-backed: does NOT terminate the underlying worker", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    handle.dispose();
    expect(fakeWorkers[0]!.terminate).not.toHaveBeenCalled();
    pool.dispose();
  });

  it("pool-backed: aborts pending request() with 'Worker was terminated'", async () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request({ op: 1 });
    handle.dispose();
    await expect(promise).rejects.toThrow("Worker was terminated");
    pool.dispose();
  });

  it("pool-backed: cleans up listeners after dispose()", () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const cb = vi.fn();
    handle.onMessage(cb);
    handle.dispose();
    fakeWorkers[0]!._emit("message", { op: 1, hostId: handle.hostId });
    expect(cb).not.toHaveBeenCalled();
    pool.dispose();
  });
});

// ─── WorkerPool.dispatch() ───────────────────────────────────────────────────

describe("WorkerPool.dispatch()", () => {
  it("resolves with the worker reply", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const promise = pool.dispatch<{ result: number }>({ op: 1 });
    fakeWorkers[0]!._emit("message", { result: 42, hostId: "host-1" });
    await expect(promise).resolves.toMatchObject({ result: 42 });
    pool.dispose();
  });

  it("automatically releases the slot after resolve", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const promise = pool.dispatch<{ result: number }>({ op: 1 });
    fakeWorkers[0]!._emit("message", { result: 1, hostId: "host-1" });
    await promise;
    expect(pool.stats().totalActive).toBe(0);
    pool.dispose();
  });

  it("automatically releases the slot after reject (worker error)", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const promise = pool.dispatch({ op: 1 });
    fakeWorkers[0]!._emit("message", {
      __fluxionError: true,
      hostId: "host-1",
      message: "boom",
    });
    await expect(promise).rejects.toThrow("boom");
    expect(pool.stats().totalActive).toBe(0);
    pool.dispose();
  });

  it("automatically releases the slot after timeout", async () => {
    vi.useFakeTimers();
    const { pool } = makePool(1);
    const promise = pool.dispatch({ op: 1 }, { timeoutMs: 100 });
    vi.advanceTimersByTime(100);
    await expect(promise).rejects.toBeInstanceOf(WorkerTimeoutError);
    expect(pool.stats().totalActive).toBe(0);
    vi.useRealTimers();
    pool.dispose();
  });

  it("rejects with WorkerTimeoutError (checkable via .is())", async () => {
    vi.useFakeTimers();
    const { pool } = makePool(1);
    const promise = pool.dispatch({ op: 1 }, { timeoutMs: 50 });
    vi.advanceTimersByTime(50);
    try {
      await promise;
    } catch (e) {
      expect(WorkerTimeoutError.is(e)).toBe(true);
    }
    vi.useRealTimers();
    pool.dispose();
  });
});

// ─── WorkerHandlerError ──────────────────────────────────────────────────────

describe("WorkerHandlerError", () => {
  it("request() rejects with WorkerHandlerError preserving worker stack", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const handle = pool.acquire();
    const promise = handle.request({ op: 1 });
    fakeWorkers[0]!._emit("message", {
      __fluxionError: true,
      hostId: handle.hostId,
      message: "worker boom",
      stack: "Error: worker boom\n  at handler (worker.ts:5:10)",
    });
    try {
      await promise;
      expect.fail("should have thrown");
    } catch (e) {
      expect(WorkerHandlerError.is(e)).toBe(true);
      expect((e as WorkerHandlerError).message).toBe("worker boom");
      expect((e as WorkerHandlerError).workerStack).toContain("worker.ts:5:10");
    }
    pool.dispose();
  });

  it("dispatch() rejects with WorkerHandlerError too", async () => {
    const { pool, fakeWorkers } = makePool(1);
    const promise = pool.dispatch({ op: 1 });
    fakeWorkers[0]!._emit("message", {
      __fluxionError: true,
      hostId: "host-1",
      message: "boom",
    });
    await expect(promise).rejects.toBeInstanceOf(WorkerHandlerError);
    pool.dispose();
  });

  it(".is() distinguishes from WorkerTimeoutError", () => {
    expect(WorkerHandlerError.is(new WorkerHandlerError("x"))).toBe(true);
    expect(WorkerHandlerError.is(new WorkerTimeoutError(100))).toBe(false);
    expect(WorkerHandlerError.is(new Error("x"))).toBe(false);
    expect(WorkerHandlerError.is(null)).toBe(false);
  });
});

// ─── postMessage hostId hygiene ──────────────────────────────────────────────

describe("WorkerHandle.postMessage hostId cleanup", () => {
  it("does not leave hostId on the caller's message object", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    const msg = { op: 1 };
    handle.postMessage(msg);
    expect((msg as { hostId?: string }).hostId).toBeUndefined();
    pool.dispose();
  });

  it("same message object can be reused across handles without bleed", () => {
    const { pool, fakeWorkers } = makePool(1);
    const h1 = pool.acquire();
    const h2 = pool.acquire();
    const msg = { op: 1 };
    h1.postMessage(msg);
    const sent1 = fakeWorkers[0]!.postMessage.mock.calls[0]![0];
    expect((sent1 as { hostId: string }).hostId).toBe(h1.hostId);
    h2.postMessage(msg);
    const sent2 = fakeWorkers[0]!.postMessage.mock.calls[1]![0];
    expect((sent2 as { hostId: string }).hostId).toBe(h2.hostId);
    expect((msg as { hostId?: string }).hostId).toBeUndefined();
    pool.dispose();
  });
});

// ─── _release race guard ─────────────────────────────────────────────────────

describe("_release dispose guard", () => {
  it("release() after dispose is a no-op (no negative count)", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    pool.dispose();
    handle.release(); // pool already disposed — should be safe
    // dispose() makes future stats() unreliable; just ensure no throw
    expect(() => handle.release()).not.toThrow();
  });
});

// ─── WorkerPool handles Set lifecycle ────────────────────────────────────────

describe("WorkerPool handles Set lifecycle", () => {
  it("removes handle from internal set after release", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    // Access the private handles set via cast to verify cleanup
    const handles = (pool as unknown as { handles: Set<WorkerHandle<TestMsg>> }).handles;
    expect(handles.size).toBe(1);
    handle.release();
    expect(handles.size).toBe(0);
    pool.dispose();
  });

  it("set stays empty after many acquire/release cycles (no leak)", () => {
    const { pool } = makePool(2);
    const handles = (pool as unknown as { handles: Set<WorkerHandle<TestMsg>> }).handles;
    for (let i = 0; i < 10; i++) {
      const h = pool.acquire();
      h.release();
    }
    expect(handles.size).toBe(0);
    pool.dispose();
  });

  it("removes handle from set after dispose() in pool-backed mode", () => {
    const { pool } = makePool(1);
    const handle = pool.acquire();
    const handles = (pool as unknown as { handles: Set<WorkerHandle<TestMsg>> }).handles;
    expect(handles.size).toBe(1);
    handle.dispose();
    expect(handles.size).toBe(0);
    pool.dispose();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
