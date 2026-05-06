import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkerErrorMsg } from "./define-worker";
import { defineWorker, defineWorkerWithState } from "./define-worker";

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

  it("posts WorkerErrorMsg when synchronous handler throws", () => {
    defineWorker(() => {
      throw new Error("sync boom");
    });
    selfMock.emit({ hostId: "host-1" });
    expect(selfMock.postMessage).toHaveBeenCalledOnce();
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.__fluxionError).toBe(true);
    expect(err.message).toBe("sync boom");
    expect(err.hostId).toBe("host-1");
    expect(typeof err.stack).toBe("string");
  });

  it("posts WorkerErrorMsg when async handler rejects", async () => {
    defineWorker(async () => {
      throw new Error("async boom");
    });
    selfMock.emit({ hostId: "host-2" });
    await Promise.resolve();
    await Promise.resolve();
    expect(selfMock.postMessage).toHaveBeenCalledOnce();
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.__fluxionError).toBe(true);
    expect(err.message).toBe("async boom");
    expect(err.hostId).toBe("host-2");
  });

  it("includes hostId in error when message has hostId", () => {
    defineWorker(() => {
      throw new Error("err");
    });
    selfMock.emit({ hostId: "h-x" });
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.hostId).toBe("h-x");
  });

  it("omits hostId in error when message has no hostId", () => {
    defineWorker(() => {
      throw new Error("err");
    });
    selfMock.emit({});
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.hostId).toBeUndefined();
  });

  it("stringifies non-Error throws", () => {
    defineWorker(() => {
      throw "string error";
    });
    selfMock.emit({ hostId: "h" });
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.message).toBe("string error");
    expect(err.stack).toBeUndefined();
  });
});

// ─── defineWorkerWithState ───────────────────────────────────────────────────

describe("defineWorkerWithState", () => {
  it("state is undefined on first call", () => {
    const handler = vi.fn().mockReturnValue(undefined);
    defineWorkerWithState(handler);
    selfMock.emit({ hostId: "h1" });
    expect(handler.mock.calls[0]![2]).toMatchObject({ hostId: "h1", state: undefined });
  });

  it("updated state is passed to next call for same hostId", () => {
    defineWorkerWithState((_msg, _reply, { state }) => {
      return { count: (state as { count: number } | undefined)?.count ?? 0 + 1 };
    });
    selfMock.emit({ hostId: "h1" });
    selfMock.emit({ hostId: "h1" });
    // second call should see state from first call
    const secondCtx = (selfMock as unknown as { onmessage: null }).onmessage;
    expect(secondCtx).toBeDefined(); // handler is registered

    // Re-verify by tracking calls directly
    const calls: Array<{ count: number } | undefined> = [];
    defineWorkerWithState<object, object, { count: number }>((_msg, _reply, { state }) => {
      calls.push(state);
      return { count: (state?.count ?? 0) + 1 };
    });
    selfMock.emit({ hostId: "h2" });
    selfMock.emit({ hostId: "h2" });
    selfMock.emit({ hostId: "h2" });
    expect(calls[0]).toBeUndefined();
    expect(calls[1]).toEqual({ count: 1 });
    expect(calls[2]).toEqual({ count: 2 });
  });

  it("state is independent per hostId", () => {
    const states: Array<unknown> = [];
    defineWorkerWithState<object, object, number>((_msg, _reply, { hostId, state }) => {
      states.push({ hostId, state });
      return (state ?? 0) + 1;
    });
    selfMock.emit({ hostId: "h1" });
    selfMock.emit({ hostId: "h2" });
    selfMock.emit({ hostId: "h1" });
    expect(states[0]).toEqual({ hostId: "h1", state: undefined });
    expect(states[1]).toEqual({ hostId: "h2", state: undefined });
    expect(states[2]).toEqual({ hostId: "h1", state: 1 });
  });

  it("null return deletes the state for this host", () => {
    const states: Array<unknown> = [];
    defineWorkerWithState<object, object, number>((_msg, _reply, { state }) => {
      states.push(state);
      return state === undefined ? 99 : null;
    });
    selfMock.emit({ hostId: "h1" });
    selfMock.emit({ hostId: "h1" });
    selfMock.emit({ hostId: "h1" });
    expect(states[0]).toBeUndefined();
    expect(states[1]).toBe(99);
    expect(states[2]).toBeUndefined(); // deleted by null, reset
  });

  it("void return leaves state unchanged", () => {
    const states: Array<unknown> = [];
    defineWorkerWithState<object, object, number>((_msg, _reply, { state }) => {
      states.push(state);
      if (state === undefined) return 10;
      // return void — state stays
    });
    selfMock.emit({ hostId: "h1" });
    selfMock.emit({ hostId: "h1" });
    selfMock.emit({ hostId: "h1" });
    expect(states[0]).toBeUndefined();
    expect(states[1]).toBe(10);
    expect(states[2]).toBe(10); // unchanged
  });

  it("solo mode: no hostId uses __solo__ key", () => {
    const states: Array<unknown> = [];
    defineWorkerWithState<object, object, number>((_msg, _reply, { hostId, state }) => {
      states.push({ hostId, state });
      return (state ?? 0) + 1;
    });
    selfMock.emit({});
    selfMock.emit({});
    expect(states[0]).toEqual({ hostId: "__solo__", state: undefined });
    expect(states[1]).toEqual({ hostId: "__solo__", state: 1 });
  });

  it("async handler: state is updated after promise resolves", async () => {
    const states: Array<unknown> = [];
    defineWorkerWithState<object, object, number>(async (_msg, _reply, { state }) => {
      states.push(state);
      await Promise.resolve();
      return (state ?? 0) + 1;
    });
    selfMock.emit({ hostId: "h1" });
    await Promise.resolve();
    await Promise.resolve();
    selfMock.emit({ hostId: "h1" });
    await Promise.resolve();
    expect(states[0]).toBeUndefined();
    expect(states[1]).toBe(1);
  });

  it("posts WorkerErrorMsg when handler throws synchronously", () => {
    defineWorkerWithState(() => {
      throw new Error("state boom");
    });
    selfMock.emit({ hostId: "h1" });
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.__fluxionError).toBe(true);
    expect(err.message).toBe("state boom");
  });

  it("posts WorkerErrorMsg when async handler rejects", async () => {
    defineWorkerWithState(async () => {
      throw new Error("async state boom");
    });
    selfMock.emit({ hostId: "h1" });
    await Promise.resolve();
    await Promise.resolve();
    const err = selfMock.postMessage.mock.calls[0]![0] as WorkerErrorMsg;
    expect(err.__fluxionError).toBe(true);
    expect(err.message).toBe("async state boom");
  });
});
