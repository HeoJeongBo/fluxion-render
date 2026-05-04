import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defineWorker } from "./define-worker";

// ─── Self mock ───────────────────────────────────────────────────────────────

interface SelfMock {
  onmessage: ((evt: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  emit: (data: unknown) => void;
}

function makeSelfMock(): SelfMock {
  const mock: SelfMock = {
    onmessage: null,
    postMessage: vi.fn(),
    emit(data: unknown) {
      mock.onmessage?.({ data } as MessageEvent);
    },
  };
  return mock;
}

let selfMock: SelfMock;

beforeEach(() => {
  selfMock = makeSelfMock();
  // defineWorker uses `self as unknown as Worker`
  (globalThis as unknown as { self: unknown }).self = selfMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("defineWorker", () => {
  it("registers onmessage on self", () => {
    defineWorker(() => {});
    expect(selfMock.onmessage).toBeTypeOf("function");
  });

  it("passes the full message to the handler", () => {
    const handler = vi.fn();
    defineWorker(handler);
    selfMock.emit({ op: "sum", hostId: "host-1", values: [1, 2, 3] });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0]).toMatchObject({ op: "sum", hostId: "host-1" });
  });

  it("echoes hostId onto every reply", () => {
    defineWorker((_msg, reply) => {
      reply({ result: 42 });
    });
    selfMock.emit({ op: "sum", hostId: "host-1" });
    expect(selfMock.postMessage).toHaveBeenCalledOnce();
    expect(selfMock.postMessage.mock.calls[0]![0]).toMatchObject({ result: 42, hostId: "host-1" });
  });

  it("omits hostId from reply when message has no hostId", () => {
    defineWorker((_msg, reply) => {
      reply({ result: 7 });
    });
    selfMock.emit({ op: "sum" });
    const [call] = selfMock.postMessage.mock.calls;
    expect(call![0]).toEqual({ result: 7 });
    expect((call![0] as Record<string, unknown>).hostId).toBeUndefined();
  });

  it("supports multiple replies per message (streaming)", () => {
    defineWorker((_msg, reply) => {
      reply({ chunk: 1 });
      reply({ chunk: 2 });
      reply({ chunk: 3 });
    });
    selfMock.emit({ hostId: "host-1" });
    expect(selfMock.postMessage).toHaveBeenCalledTimes(3);
    for (const call of selfMock.postMessage.mock.calls) {
      expect((call[0] as Record<string, unknown>).hostId).toBe("host-1");
    }
  });

  it("forwards transfer array when provided", () => {
    const buf = new ArrayBuffer(8);
    defineWorker((_msg, reply) => {
      reply({ buffer: buf }, [buf]);
    });
    selfMock.emit({ hostId: "host-1" });
    const [call] = selfMock.postMessage.mock.calls;
    expect(call![1]).toEqual([buf]);
  });

  it("does not pass transfer arg when transfer array is empty", () => {
    defineWorker((_msg, reply) => {
      reply({ result: 1 }, []);
    });
    selfMock.emit({ hostId: "host-1" });
    const [call] = selfMock.postMessage.mock.calls;
    expect(call![1]).toBeUndefined();
  });

  it("does not pass transfer arg when transfer is omitted", () => {
    defineWorker((_msg, reply) => {
      reply({ result: 1 });
    });
    selfMock.emit({ hostId: "host-1" });
    const [call] = selfMock.postMessage.mock.calls;
    expect(call![1]).toBeUndefined();
  });

  it("handles async handlers", async () => {
    defineWorker(async (_msg, reply) => {
      await Promise.resolve();
      reply({ result: 99 });
    });
    selfMock.emit({ hostId: "host-async" });
    // flush microtasks
    await Promise.resolve();
    expect(selfMock.postMessage).toHaveBeenCalledOnce();
    expect(selfMock.postMessage.mock.calls[0]![0]).toMatchObject({ result: 99, hostId: "host-async" });
  });

  it("overwrites onmessage on repeated defineWorker calls", () => {
    const first = vi.fn();
    const second = vi.fn();
    defineWorker(first);
    defineWorker(second);
    selfMock.emit({ hostId: "h" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
