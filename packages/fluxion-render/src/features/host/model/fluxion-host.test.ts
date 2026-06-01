import { describe, expect, it, vi } from "vitest";
import { Op, WorkerOp } from "../../../shared/protocol";
import { FluxionHost } from "./fluxion-host";

interface RecordedPost {
  msg: unknown;
  transfer?: Transferable[];
}

function makeFakeWorker() {
  const posts: RecordedPost[] = [];
  const terminate = vi.fn();
  const worker = {
    postMessage: vi.fn((msg: unknown, transfer?: Transferable[]) => {
      posts.push({ msg, transfer });
    }),
    terminate,
    onmessage: null,
    onerror: null,
  };
  return { worker: worker as unknown as Worker, posts, terminate };
}

function makeCanvas(width = 400, height = 300) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe("FluxionHost", () => {
  it("sends INIT with OffscreenCanvas in the transfer list on construction", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(400, 300), {
      workerFactory: () => worker,
    });
    expect(posts).toHaveLength(1);
    const [first] = posts;
    expect((first.msg as { op: number }).op).toBe(Op.INIT);
    expect(first.transfer).toHaveLength(1);
    host.dispose();
  });

  it("addLayer / configLayer / removeLayer post the right opcodes", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    posts.length = 0;
    host.addLayer("chart", "line", { color: "#0ff" });
    host.configLayer("chart", { lineWidth: 3 });
    host.removeLayer("chart");
    expect(posts.map((p) => (p.msg as { op: number }).op)).toEqual([
      Op.ADD_LAYER,
      Op.CONFIG,
      Op.REMOVE_LAYER,
    ]);
    host.dispose();
  });

  it("pushData transfers the underlying ArrayBuffer", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    posts.length = 0;
    const data = new Float32Array([1, 2, 3, 4]);
    const buffer = data.buffer;
    host.pushData("chart", data);
    expect(posts).toHaveLength(1);
    const [post] = posts;
    const msg = post.msg as {
      op: number;
      dtype: string;
      length: number;
      buffer: ArrayBuffer;
    };
    expect(msg.op).toBe(Op.DATA);
    expect(msg.dtype).toBe("f32");
    expect(msg.length).toBe(4);
    expect(msg.buffer).toBe(buffer);
    expect(post.transfer).toEqual([buffer]);
    host.dispose();
  });

  it("infers dtype from TypedArray kind", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    posts.length = 0;
    host.pushData("a", new Uint8Array([1, 2]));
    host.pushData("b", new Int16Array([1, 2]));
    host.pushData("c", new Uint16Array([1, 2]));
    host.pushData("d", new Int32Array([1, 2]));
    const dtypes = posts.map((p) => (p.msg as { dtype: string }).dtype);
    expect(dtypes).toEqual(["u8", "i16", "u16", "i32"]);
    host.dispose();
  });

  it("rejects TypedArray subviews with non-zero byteOffset", () => {
    const { worker } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    const underlying = new ArrayBuffer(64);
    const subview = new Float32Array(underlying, 8, 4); // byteOffset = 8
    expect(() => host.pushData("chart", subview)).toThrow(/byteOffset 0/);
    host.dispose();
  });

  it("dispose terminates the worker and becomes a no-op afterwards", () => {
    const { worker, posts, terminate } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    host.dispose();
    expect(terminate).toHaveBeenCalledTimes(1);
    posts.length = 0;
    host.addLayer("x", "line");
    host.pushData("x", new Float32Array([1]));
    expect(posts).toHaveLength(0);
  });

  it("addLineLayer creates the layer and returns a typed handle", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    posts.length = 0;
    const line = host.addLineLayer("chart", { color: "#0ff" });
    expect(line.id).toBe("chart");
    // ADD_LAYER with kind "line" was posted
    const addMsg = posts[0].msg as { op: number; kind: string };
    expect(addMsg.op).toBe(Op.ADD_LAYER);
    expect(addMsg.kind).toBe("line");

    line.push({ t: 100, y: 0.5 });
    // ADD_LAYER + DATA were posted. DATA encodes [100, 0.5].
    const dataMsg = posts.find((p) => (p.msg as { op: number }).op === Op.DATA);
    expect(dataMsg).toBeDefined();
    const ms = dataMsg!.msg as { buffer: ArrayBuffer; length: number };
    expect(ms.length).toBe(2);
    expect(Array.from(new Float32Array(ms.buffer, 0, 2))).toEqual([100, 0.5]);
    host.dispose();
  });

  it("addLineLayer handle pushBatch transfers a single encoded buffer", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    const line = host.addLineLayer("chart");
    posts.length = 0;
    line.pushBatch([
      { t: 1, y: 10 },
      { t: 2, y: 20 },
      { t: 3, y: 30 },
    ]);
    expect(posts).toHaveLength(1);
    const ms = posts[0].msg as { buffer: ArrayBuffer; length: number };
    expect(ms.length).toBe(6);
    expect(Array.from(new Float32Array(ms.buffer, 0, 6))).toEqual([1, 10, 2, 20, 3, 30]);
    // Buffer must be in the transfer list.
    expect(posts[0].transfer).toEqual([ms.buffer]);
    host.dispose();
  });

  it("addLidarLayer handle encodes x,y,z,intensity with default stride 4", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    const cloud = host.addLidarLayer("cloud", { pointSize: 2 });
    posts.length = 0;
    cloud.push([
      { x: 1, y: 2, intensity: 0.5 },
      { x: 3, y: 4, z: 1, intensity: 0.9 },
    ]);
    const ms = posts[0].msg as { buffer: ArrayBuffer; length: number };
    expect(ms.length).toBe(8);
    const arr = new Float32Array(ms.buffer, 0, 8);
    const expected = [1, 2, 0, 0.5, 3, 4, 1, 0.9];
    for (let i = 0; i < 8; i++) expect(arr[i]).toBeCloseTo(expected[i], 5);
    host.dispose();
  });

  it("addLidarLayer respects stride override from config", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    const cloud = host.addLidarLayer("cloud", { stride: 2, pointSize: 1 });
    expect(cloud.stride).toBe(2);
    posts.length = 0;
    cloud.push([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    const ms = posts[0].msg as { buffer: ArrayBuffer; length: number };
    expect(ms.length).toBe(4);
    expect(Array.from(new Float32Array(ms.buffer, 0, 4))).toEqual([1, 2, 3, 4]);
    host.dispose();
  });

  it("addLineStaticLayer handle setXY replaces with interleaved data", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    const plot = host.addLineStaticLayer("plot", { layout: "xy" });
    posts.length = 0;
    plot.setXY([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]);
    const ms = posts[0].msg as { buffer: ArrayBuffer; length: number };
    expect(Array.from(new Float32Array(ms.buffer, 0, ms.length))).toEqual([0, 1, 2, 3]);
    host.dispose();
  });

  it("host.line(id) attaches a handle to a preexisting layer", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    // Simulate "layer added via useFluxionCanvas"
    host.addLayer("preexisting", "line", { color: "#fff" });
    const line = host.line("preexisting");
    posts.length = 0;
    line.push({ t: 50, y: 0.25 });
    const ms = posts[0].msg as {
      op: number;
      id: string;
      buffer: ArrayBuffer;
    };
    expect(ms.op).toBe(Op.DATA);
    expect(ms.id).toBe("preexisting");
    expect(Array.from(new Float32Array(ms.buffer, 0, 2))).toEqual([50, 0.25]);
    host.dispose();
  });

  it("constructor forwards bgColor into the INIT message", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
      bgColor: "#ffffff",
    });
    const init = posts[0].msg as { op: number; bgColor?: string };
    expect(init.op).toBe(Op.INIT);
    expect(init.bgColor).toBe("#ffffff");
    host.dispose();
  });

  it("omitting bgColor leaves the init field undefined (engine default applies)", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    const init = posts[0].msg as { op: number; bgColor?: string };
    expect(init.op).toBe(Op.INIT);
    expect(init.bgColor).toBeUndefined();
    host.dispose();
  });

  it("setBgColor posts a SET_BG_COLOR message", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    posts.length = 0;
    host.setBgColor("#ff00aa");
    expect(posts).toHaveLength(1);
    const msg = posts[0].msg as { op: number; color: string };
    expect(msg.op).toBe(Op.SET_BG_COLOR);
    expect(msg.color).toBe("#ff00aa");
    host.dispose();
  });

  it("resize posts a RESIZE message with dpr", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), {
      workerFactory: () => worker,
    });
    posts.length = 0;
    host.resize(800, 600, 2);
    const msg = posts[0].msg as {
      op: number;
      width: number;
      height: number;
      dpr: number;
    };
    expect(msg.op).toBe(Op.RESIZE);
    expect(msg.width).toBe(800);
    expect(msg.height).toBe(600);
    expect(msg.dpr).toBe(2);
    host.dispose();
  });

  it("clearLayer posts CLEAR_DATA with optional latestT rewind", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    posts.length = 0;

    host.clearLayer("chart");
    host.clearLayer("chart", { latestT: 5000 });

    expect(posts.map((p) => (p.msg as { op: number }).op)).toEqual([
      Op.CLEAR_DATA,
      Op.CLEAR_DATA,
    ]);
    const first = posts[0].msg as { id: string; latestT?: number };
    expect(first.id).toBe("chart");
    expect(first.latestT).toBeUndefined();
    const second = posts[1].msg as { id: string; latestT?: number };
    expect(second.id).toBe("chart");
    expect(second.latestT).toBe(5000);
    host.dispose();
  });

  it("addAxisLayer posts ADD_LAYER with kind axis-grid", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    posts.length = 0;
    host.addAxisLayer("grid", { xRange: [0, 10], yRange: [0, 10] });
    expect(posts).toHaveLength(1);
    const msg = posts[0].msg as { op: number; kind: string };
    expect(msg.op).toBe(Op.ADD_LAYER);
    expect(msg.kind).toBe("axis-grid");
    host.dispose();
  });

  it("typed handle accessors return correct handle types with right ids", () => {
    const { worker } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    expect(host.line("a").id).toBe("a");
    expect(host.lineStatic("b").id).toBe("b");
    expect(host.lidar("c").id).toBe("c");
    expect(host.scatter("d").id).toBe("d");
    expect(host.area("e").id).toBe("e");
    expect(host.step("f").id).toBe("f");
    expect(host.bar("g").id).toBe("g");
    expect(host.candlestick("h").id).toBe("h");
    expect(host.heatmap("i").id).toBe("i");
    expect(host.eventMarker("j").id).toBe("j");
    expect(host.scatterColored("k").id).toBe("k");
    expect(host.heatmapStream("l").id).toBe("l");
    expect(host.referenceLine("m").id).toBe("m");
    expect(host.poseArrow("n").id).toBe("n");
    host.dispose();
  });

  it("lidar() accessor respects explicit stride", () => {
    const { worker } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    expect(host.lidar("pts", 2).stride).toBe(2);
    expect(host.lidar("pts", 3).stride).toBe(3);
    host.dispose();
  });

  it("dispose removes the worker message listener", () => {
    const listeners: { type: string; fn: EventListener }[] = [];
    const { worker, posts } = makeFakeWorker();
    const workerWithEvents = {
      ...worker,
      addEventListener: (type: string, fn: EventListener) => {
        listeners.push({ type, fn });
      },
      removeEventListener: (type: string, fn: EventListener) => {
        const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => workerWithEvents as unknown as Worker });
    expect(listeners).toHaveLength(1);
    host.dispose();
    expect(listeners).toHaveLength(0);
    posts.length = 0;
    host.dispose();
    expect(posts).toHaveLength(0);
  });

  it("onBoundsChange fires when worker sends BOUNDS_UPDATE", () => {
    const { worker } = makeFakeWorker();
    let messageHandler: ((evt: Event) => void) | null = null;
    const workerWithEvents = {
      ...worker,
      addEventListener: (_type: string, fn: EventListener) => {
        messageHandler = fn as (evt: Event) => void;
      },
      removeEventListener: () => {},
    };
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => workerWithEvents as unknown as Worker });
    const received: { yMin: number; yMax: number; latestT: number }[] = [];
    host.onBoundsChange((yMin, yMax, latestT) => received.push({ yMin, yMax, latestT }));
    messageHandler!({ data: { op: WorkerOp.BOUNDS_UPDATE, hostId: "x", yMin: -1, yMax: 1, latestT: 500 } } as unknown as Event);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ yMin: -1, yMax: 1, latestT: 500 });
    host.dispose();
  });

  it("onTickUpdate fires when worker sends TICK_UPDATE", () => {
    const { worker } = makeFakeWorker();
    let messageHandler: ((evt: Event) => void) | null = null;
    const workerWithEvents = {
      ...worker,
      addEventListener: (_type: string, fn: EventListener) => {
        messageHandler = fn as (evt: Event) => void;
      },
      removeEventListener: () => {},
    };
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => workerWithEvents as unknown as Worker });
    const received: { xTicks: unknown; yTicks: unknown }[] = [];
    host.onTickUpdate((xTicks, yTicks) => received.push({ xTicks, yTicks }));
    const xTicks = [{ value: 0, label: "0", fraction: 0 }];
    const yTicks = [{ value: 1, label: "1", fraction: 0.5 }];
    messageHandler!({ data: { op: WorkerOp.TICK_UPDATE, hostId: "x", xTicks, yTicks, xRawValues: [] } } as unknown as Event);
    expect(received).toHaveLength(1);
    expect(received[0].xTicks).toBe(xTicks);
    expect(received[0].yTicks).toBe(yTicks);
    host.dispose();
  });

  it("onBoundsChange unsubscribe removes listener", () => {
    const { worker } = makeFakeWorker();
    let messageHandler: ((evt: Event) => void) | null = null;
    const workerWithEvents = {
      ...worker,
      addEventListener: (_type: string, fn: EventListener) => {
        messageHandler = fn as (evt: Event) => void;
      },
      removeEventListener: () => {},
    };
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => workerWithEvents as unknown as Worker });
    let count = 0;
    const unsub = host.onBoundsChange(() => { count++; });
    messageHandler!({ data: { op: WorkerOp.BOUNDS_UPDATE, hostId: "x", yMin: 0, yMax: 1, latestT: 0 } } as unknown as Event);
    expect(count).toBe(1);
    unsub();
    messageHandler!({ data: { op: WorkerOp.BOUNDS_UPDATE, hostId: "x", yMin: 0, yMax: 1, latestT: 0 } } as unknown as Event);
    expect(count).toBe(1);
    host.dispose();
  });

  it("onTickUpdate unsubscribe removes listener", () => {
    const { worker } = makeFakeWorker();
    let messageHandler: ((evt: Event) => void) | null = null;
    const workerWithEvents = {
      ...worker,
      addEventListener: (_type: string, fn: EventListener) => {
        messageHandler = fn as (evt: Event) => void;
      },
      removeEventListener: () => {},
    };
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => workerWithEvents as unknown as Worker });
    let count = 0;
    const unsub = host.onTickUpdate(() => { count++; });
    messageHandler!({ data: { op: WorkerOp.TICK_UPDATE, hostId: "x", xTicks: [], yTicks: [], xRawValues: [] } } as unknown as Event);
    expect(count).toBe(1);
    unsub();
    messageHandler!({ data: { op: WorkerOp.TICK_UPDATE, hostId: "x", xTicks: [], yTicks: [], xRawValues: [] } } as unknown as Event);
    expect(count).toBe(1);
    host.dispose();
  });

  it("ignores unknown worker message op codes", () => {
    const { worker } = makeFakeWorker();
    let messageHandler: ((evt: Event) => void) | null = null;
    const workerWithEvents = {
      ...worker,
      addEventListener: (_type: string, fn: EventListener) => {
        messageHandler = fn as (evt: Event) => void;
      },
      removeEventListener: () => {},
    };
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => workerWithEvents as unknown as Worker });
    expect(() => {
      messageHandler!({ data: { op: 999 } } as unknown as Event);
      messageHandler!({ data: null } as unknown as Event);
      messageHandler!({ data: "string" } as unknown as Event);
    }).not.toThrow();
    host.dispose();
  });

  it("emitStream transfers the ArrayBuffer with mode:stream and the given id/length", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    posts.length = 0;
    const buffer = new Float32Array([1, 2, 3, 4]).buffer;
    host.emitStream("sensor", buffer, 4);
    expect(posts).toHaveLength(1);
    const [post] = posts;
    const msg = post.msg as { id: string; length: number; mode: string; buffer: ArrayBuffer };
    expect(msg.id).toBe("sensor");
    expect(msg.length).toBe(4);
    expect(msg.mode).toBe("stream");
    expect(msg.buffer).toBe(buffer);
    expect(post.transfer).toEqual([buffer]);
    host.dispose();
  });

  it("emitStream is a no-op after dispose", () => {
    const { worker, posts } = makeFakeWorker();
    const host = new FluxionHost(makeCanvas(), { workerFactory: () => worker });
    host.dispose();
    posts.length = 0;
    host.emitStream("sensor", new ArrayBuffer(8), 2);
    expect(posts).toHaveLength(0);
  });
});
