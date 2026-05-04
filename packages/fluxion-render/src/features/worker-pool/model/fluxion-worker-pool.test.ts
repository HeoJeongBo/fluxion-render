import { describe, expect, it, vi } from "vitest";

import { Op } from "../../../shared/protocol";
import type { HostMsg } from "../../../shared/protocol";
import { FluxionWorkerPool } from "./fluxion-worker-pool";

// ─── Fake Worker ─────────────────────────────────────────────────────────────

interface FakeWorker {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeFakeWorker(): FakeWorker {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makePool(size = 1): { pool: FluxionWorkerPool; fakeWorkers: FakeWorker[] } {
  const fakeWorkers: FakeWorker[] = [];
  const pool = new FluxionWorkerPool({
    size,
    workerFactory: () => {
      const w = makeFakeWorker();
      fakeWorkers.push(w);
      return w as unknown as Worker;
    },
  });
  return { pool, fakeWorkers };
}

function makeInitMsg(): HostMsg {
  return {
    op: Op.INIT,
    canvas: {} as OffscreenCanvas,
    width: 400,
    height: 300,
    dpr: 1,
  };
}

// ─── FluxionWorkerHandle — protocol transformations ──────────────────────────

describe("FluxionWorkerHandle", () => {
  describe("INIT → POOL_INIT transformation", () => {
    it("converts INIT to POOL_INIT and stamps hostId", () => {
      const { pool, fakeWorkers } = makePool();
      const handle = pool.acquire();
      handle.postMessage(makeInitMsg(), []);

      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      const msg = call![0] as { op: number; hostId: string };
      expect(msg.op).toBe(Op.POOL_INIT);
      expect(msg.hostId).toBe(handle.hostId);
      pool.dispose();
    });

    it("uses empty transfer when none provided", () => {
      const { pool, fakeWorkers } = makePool();
      const handle = pool.acquire();
      handle.postMessage(makeInitMsg());

      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      expect(call![1]).toEqual([]);
      pool.dispose();
    });

    it("forwards provided transfer list", () => {
      const { pool, fakeWorkers } = makePool();
      const handle = pool.acquire();
      const transfer = [new ArrayBuffer(4)];
      handle.postMessage(makeInitMsg(), transfer);

      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      expect(call![1]).toBe(transfer);
      pool.dispose();
    });
  });

  describe("DISPOSE → POOL_DISPOSE transformation", () => {
    it("converts DISPOSE to POOL_DISPOSE with hostId", () => {
      const { pool, fakeWorkers } = makePool();
      const handle = pool.acquire();
      handle.postMessage({ op: Op.DISPOSE });

      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      const msg = call![0] as { op: number; hostId: string };
      expect(msg.op).toBe(Op.POOL_DISPOSE);
      expect(msg.hostId).toBe(handle.hostId);
      pool.dispose();
    });

    it("calls release() so the worker can be reused", () => {
      const { pool, fakeWorkers: _ } = makePool(1);
      const h1 = pool.acquire();
      h1.postMessage({ op: Op.DISPOSE });

      // After release, pool should have 1 slot free — next acquire stays on same worker
      const h2 = pool.acquire();
      expect(h2.hostId).not.toBe(h1.hostId);
      pool.dispose();
    });
  });

  describe("regular messages", () => {
    it("stamps hostId and forwards via base class", () => {
      const { pool, fakeWorkers } = makePool();
      const handle = pool.acquire();
      const buf = new ArrayBuffer(8);
      const msg: HostMsg = {
        op: Op.DATA,
        id: "layer1",
        buffer: buf,
        dtype: "f32",
        length: 2,
      };
      handle.postMessage(msg, [buf]);

      const [call] = fakeWorkers[0]!.postMessage.mock.calls;
      const sent = call![0] as { op: number; hostId: string };
      expect(sent.op).toBe(Op.DATA);
      expect(sent.hostId).toBe(handle.hostId);
      expect(call![1]).toEqual([buf]);
      pool.dispose();
    });
  });
});

// ─── FluxionWorkerPool — acquire returns FluxionWorkerHandle ─────────────────

describe("FluxionWorkerPool", () => {
  it("acquire() returns a FluxionWorkerHandle that can transform INIT messages", () => {
    const { pool, fakeWorkers } = makePool();
    const handle = pool.acquire();
    handle.postMessage(makeInitMsg(), []);
    const msg = fakeWorkers[0]!.postMessage.mock.calls[0]![0] as { op: number };
    expect(msg.op).toBe(Op.POOL_INIT);
    pool.dispose();
  });
});
