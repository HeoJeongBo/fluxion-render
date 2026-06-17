import { describe, expect, it, vi } from "vitest";
import {
  AreaLayerHandle,
  BarLayerHandle,
  CandlestickLayerHandle,
  EventMarkerHandle,
  type FluxionDataSink,
  HeatmapLayerHandle,
  HeatmapStreamHandle,
  HistogramHandle,
  LidarLayerHandle,
  LineLayerHandle,
  LineStaticLayerHandle,
  OccupancyGridHandle,
  PoseArrowHandle,
  ReferenceLineHandle,
  ScatterColoredHandle,
  ScatterLayerHandle,
  StepLayerHandle,
  TrajectoryHandle,
} from "./layer-handles";

function makeFakeSink() {
  const pushes: { id: string; data: Float32Array }[] = [];
  const configs: { id: string; config: unknown }[] = [];
  const clears: { id: string; opts?: { latestT?: number } }[] = [];
  const sink: FluxionDataSink = {
    pushData: vi.fn((id: string, data: Float32Array) => {
      pushes.push({ id, data });
    }),
    configLayer: vi.fn((id: string, config: unknown) => {
      configs.push({ id, config });
    }),
    clearLayer: vi.fn((id: string, opts?: { latestT?: number }) => {
      clears.push({ id, opts });
    }),
  };
  return { sink, pushes, configs, clears };
}

/** Compare a Float32Array to an expected float array with tolerance. */
function expectF32Close(
  actual: Float32Array,
  expected: readonly number[],
  precision = 5,
) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], precision);
  }
}

describe("LineLayerHandle", () => {
  it("push encodes a single [t,y] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineLayerHandle(sink, "chart");
    h.push({ t: 123, y: 0.5 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].id).toBe("chart");
    expectF32Close(pushes[0].data, [123, 0.5]);
  });

  it("pushBatch encodes every sample into one Float32Array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineLayerHandle(sink, "chart");
    h.pushBatch([
      { t: 100, y: 0.1 },
      { t: 200, y: 0.2 },
      { t: 300, y: 0.3 },
    ]);
    expect(pushes).toHaveLength(1);
    expectF32Close(pushes[0].data, [100, 0.1, 200, 0.2, 300, 0.3]);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineLayerHandle(sink, "chart");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineLayerHandle(sink, "chart");
    const raw = new Float32Array([1, 2, 3, 4]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });

  it("reset(latestT) forwards a rewind to clearLayer", () => {
    const { sink, clears } = makeFakeSink();
    const h = new LineLayerHandle(sink, "chart");
    h.reset(1234);
    expect(clears).toHaveLength(1);
    expect(clears[0]).toEqual({ id: "chart", opts: { latestT: 1234 } });
  });

  it("reset() with no argument leaves latestT untouched", () => {
    const { sink, clears } = makeFakeSink();
    const h = new LineLayerHandle(sink, "chart");
    h.reset();
    expect(clears).toHaveLength(1);
    expect(clears[0].id).toBe("chart");
    expect(clears[0].opts?.latestT).toBeUndefined();
  });
});

describe("LineStaticLayerHandle", () => {
  it("setXY interleaves xy points", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineStaticLayerHandle(sink, "plot");
    h.setXY([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
      { x: 4, y: 5 },
    ]);
    expect(Array.from(pushes[0].data)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("setY writes a flat y array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineStaticLayerHandle(sink, "plot");
    h.setY([10, 20, 30]);
    expect(Array.from(pushes[0].data)).toEqual([10, 20, 30]);
  });
});

describe("LidarLayerHandle", () => {
  it("default stride=4 fills x,y,z,intensity with zeros for missing fields", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LidarLayerHandle(sink, "cloud");
    h.push([
      { x: 1, y: 2 },
      { x: 3, y: 4, z: 5 },
      { x: 6, y: 7, z: 8, intensity: 0.9 },
    ]);
    expectF32Close(pushes[0].data, [1, 2, 0, 0, 3, 4, 5, 0, 6, 7, 8, 0.9]);
  });

  it("stride=2 emits only x,y", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LidarLayerHandle(sink, "cloud", 2);
    h.push([
      { x: 1, y: 2, z: 999, intensity: 999 },
      { x: 3, y: 4 },
    ]);
    expect(Array.from(pushes[0].data)).toEqual([1, 2, 3, 4]);
  });

  it("stride=3 emits x,y,z and ignores intensity", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LidarLayerHandle(sink, "cloud", 3);
    h.push([
      { x: 1, y: 2, z: 3, intensity: 999 },
      { x: 4, y: 5 },
    ]);
    expect(Array.from(pushes[0].data)).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it("pushRaw forwards unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LidarLayerHandle(sink, "cloud", 4);
    const raw = new Float32Array(8);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("ReferenceLineHandle", () => {
  it("setReference calls configLayer with the config object", () => {
    const { sink, configs } = makeFakeSink();
    const h = new ReferenceLineHandle(sink, "ref");
    h.setReference({ y: 50, bandMin: 40, bandMax: 60, color: "#4fc3f7" });
    expect(configs).toHaveLength(1);
    expect(configs[0].id).toBe("ref");
    expect(configs[0].config).toMatchObject({ y: 50, bandMin: 40, bandMax: 60 });
  });
});

describe("PoseArrowHandle", () => {
  it("push encodes a single [t, y, theta] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new PoseArrowHandle(sink, "pose");
    h.push({ t: 100, y: 0.5, theta: Math.PI / 2 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].id).toBe("pose");
    expect(pushes[0].data.length).toBe(3);
    expect(pushes[0].data[0]).toBeCloseTo(100);
    expect(pushes[0].data[1]).toBeCloseTo(0.5);
    expect(pushes[0].data[2]).toBeCloseTo(Math.PI / 2);
  });

  it("pushBatch encodes multiple samples into one Float32Array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new PoseArrowHandle(sink, "pose");
    h.pushBatch([
      { t: 100, y: 0.1, theta: 0 },
      { t: 200, y: 0.2, theta: Math.PI },
      { t: 300, y: 0.3, theta: -Math.PI / 4 },
    ]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].data.length).toBe(9);
    expect(pushes[0].data[0]).toBeCloseTo(100);
    expect(pushes[0].data[3]).toBeCloseTo(200);
    expect(pushes[0].data[6]).toBeCloseTo(300);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new PoseArrowHandle(sink, "pose");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new PoseArrowHandle(sink, "pose");
    const raw = new Float32Array([1, 2, 3]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("TrajectoryHandle", () => {
  it("push encodes a single [x, y, t] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new TrajectoryHandle(sink, "tj");
    h.push({ x: 1.5, y: -2.5, t: 100 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].id).toBe("tj");
    expect(pushes[0].data.length).toBe(3);
    expect(pushes[0].data[0]).toBeCloseTo(1.5);
    expect(pushes[0].data[1]).toBeCloseTo(-2.5);
    expect(pushes[0].data[2]).toBeCloseTo(100);
  });

  it("pushBatch encodes multiple samples into one Float32Array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new TrajectoryHandle(sink, "tj");
    h.pushBatch([
      { x: 0, y: 0, t: 0 },
      { x: 1, y: 1, t: 100 },
    ]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].data.length).toBe(6);
    expect(pushes[0].data[3]).toBeCloseTo(1);
    expect(pushes[0].data[5]).toBeCloseTo(100);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new TrajectoryHandle(sink, "tj");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new TrajectoryHandle(sink, "tj");
    const raw = new Float32Array([1, 2, 3]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });

  it("reset forwards a rewind to clearLayer", () => {
    const { sink, clears } = makeFakeSink();
    const h = new TrajectoryHandle(sink, "tj");
    h.reset(500);
    expect(clears[0]).toEqual({ id: "tj", opts: { latestT: 500 } });
  });
});

describe("HistogramHandle", () => {
  it("setValues copies the raw value array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HistogramHandle(sink, "hg");
    h.setValues([1, 2, 3, 4]);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].id).toBe("hg");
    expect(Array.from(pushes[0].data)).toEqual([1, 2, 3, 4]);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HistogramHandle(sink, "hg");
    const raw = new Float32Array([5, 6, 7]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("OccupancyGridHandle", () => {
  it("setGrid encodes header + row-major cells", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new OccupancyGridHandle(sink, "og");
    h.setGrid({
      originX: -1,
      originY: -2,
      resolution: 0.5,
      cols: 2,
      rows: 2,
      cells: [0, 100, -1, 50],
    });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].id).toBe("og");
    expect(pushes[0].data.length).toBe(5 + 4);
    expect(pushes[0].data[0]).toBeCloseTo(-1);
    expect(pushes[0].data[2]).toBeCloseTo(0.5);
    expect(pushes[0].data[3]).toBe(2);
    expect(pushes[0].data[5]).toBe(0);
    expect(pushes[0].data[6]).toBe(100);
    expect(pushes[0].data[7]).toBe(-1);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new OccupancyGridHandle(sink, "og");
    const raw = new Float32Array([0, 0, 1, 1, 1, 42]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("LineStaticLayerHandle", () => {
  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new LineStaticLayerHandle(sink, "plot");
    const raw = new Float32Array([1, 2, 3]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("ScatterLayerHandle", () => {
  it("push encodes a single [t,y] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterLayerHandle(sink, "sc");
    h.push({ t: 10, y: 0.3 });
    expect(pushes).toHaveLength(1);
    expectF32Close(pushes[0].data, [10, 0.3]);
  });

  it("pushBatch encodes multiple samples", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterLayerHandle(sink, "sc");
    h.pushBatch([
      { t: 1, y: 0.1 },
      { t: 2, y: 0.2 },
    ]);
    expect(pushes).toHaveLength(1);
    expectF32Close(pushes[0].data, [1, 0.1, 2, 0.2]);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterLayerHandle(sink, "sc");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterLayerHandle(sink, "sc");
    const raw = new Float32Array([1, 2]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("AreaLayerHandle", () => {
  it("push encodes a single [t,y] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new AreaLayerHandle(sink, "area");
    h.push({ t: 5, y: 0.7 });
    expectF32Close(pushes[0].data, [5, 0.7]);
  });

  it("pushBatch encodes multiple samples", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new AreaLayerHandle(sink, "area");
    h.pushBatch([
      { t: 1, y: 0.1 },
      { t: 2, y: 0.2 },
    ]);
    expectF32Close(pushes[0].data, [1, 0.1, 2, 0.2]);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new AreaLayerHandle(sink, "area");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new AreaLayerHandle(sink, "area");
    const raw = new Float32Array([1, 2]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("StepLayerHandle", () => {
  it("push encodes a single [t,y] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new StepLayerHandle(sink, "step");
    h.push({ t: 3, y: 0.9 });
    expectF32Close(pushes[0].data, [3, 0.9]);
  });

  it("pushBatch encodes multiple samples", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new StepLayerHandle(sink, "step");
    h.pushBatch([
      { t: 10, y: 1 },
      { t: 20, y: 2 },
    ]);
    expect(Array.from(pushes[0].data)).toEqual([10, 1, 20, 2]);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new StepLayerHandle(sink, "step");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new StepLayerHandle(sink, "step");
    const raw = new Float32Array([5, 6]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("BarLayerHandle", () => {
  it("setXY interleaves xy points", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new BarLayerHandle(sink, "bar");
    h.setXY([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(Array.from(pushes[0].data)).toEqual([1, 2, 3, 4]);
  });

  it("setY writes a flat y array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new BarLayerHandle(sink, "bar");
    h.setY([10, 20, 30]);
    expect(Array.from(pushes[0].data)).toEqual([10, 20, 30]);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new BarLayerHandle(sink, "bar");
    const raw = new Float32Array([7, 8]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("CandlestickLayerHandle", () => {
  it("push encodes a single [t,open,high,low,close] sample", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new CandlestickLayerHandle(sink, "cs");
    h.push({ t: 100, open: 1, high: 3, low: 0.5, close: 2 });
    expect(Array.from(pushes[0].data)).toEqual([100, 1, 3, 0.5, 2]);
  });

  it("pushBatch encodes multiple samples", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new CandlestickLayerHandle(sink, "cs");
    h.pushBatch([
      { t: 1, open: 1, high: 2, low: 0, close: 1.5 },
      { t: 2, open: 2, high: 3, low: 1, close: 2.5 },
    ]);
    expect(pushes[0].data.length).toBe(10);
    expect(pushes[0].data[0]).toBe(1);
    expect(pushes[0].data[5]).toBe(2);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new CandlestickLayerHandle(sink, "cs");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new CandlestickLayerHandle(sink, "cs");
    const raw = new Float32Array(5);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("HeatmapLayerHandle", () => {
  it("setGrid encodes [x,y,value] triples", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HeatmapLayerHandle(sink, "hm");
    h.setGrid([
      { x: 0, y: 0, value: 0.1 },
      { x: 1, y: 1, value: 0.9 },
    ]);
    expect(pushes[0].data.length).toBe(6);
    expect(pushes[0].data[0]).toBeCloseTo(0);
    expect(pushes[0].data[2]).toBeCloseTo(0.1);
    expect(pushes[0].data[5]).toBeCloseTo(0.9);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HeatmapLayerHandle(sink, "hm");
    const raw = new Float32Array(6);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("EventMarkerHandle", () => {
  it("setEvents encodes [t,severity] pairs", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new EventMarkerHandle(sink, "ev");
    h.setEvents([{ t: 100 }, { t: 200, severity: 2 }]);
    expect(Array.from(pushes[0].data)).toEqual([100, 0, 200, 2]);
  });

  it("clearEvents pushes an empty Float32Array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new EventMarkerHandle(sink, "ev");
    h.clearEvents();
    expect(pushes).toHaveLength(1);
    expect(pushes[0].data.length).toBe(0);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new EventMarkerHandle(sink, "ev");
    const raw = new Float32Array([1, 0]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("ScatterColoredHandle", () => {
  it("push encodes [t,y,colorValue,size] with defaults", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterColoredHandle(sink, "sc");
    h.push({ t: 10, y: 0.5 });
    expect(pushes[0].data.length).toBe(4);
    expect(pushes[0].data[0]).toBeCloseTo(10);
    expect(pushes[0].data[1]).toBeCloseTo(0.5);
    expect(pushes[0].data[2]).toBeCloseTo(0.5);
    expect(pushes[0].data[3]).toBeCloseTo(0.5);
  });

  it("push uses provided colorValue and size", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterColoredHandle(sink, "sc");
    h.push({ t: 5, y: 1, colorValue: 0.2, size: 0.8 });
    expect(pushes[0].data[2]).toBeCloseTo(0.2);
    expect(pushes[0].data[3]).toBeCloseTo(0.8);
  });

  it("pushBatch encodes multiple samples", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterColoredHandle(sink, "sc");
    h.pushBatch([
      { t: 1, y: 0.1, colorValue: 0.1, size: 0.1 },
      { t: 2, y: 0.2, colorValue: 0.2, size: 0.2 },
    ]);
    expect(pushes[0].data.length).toBe(8);
    expect(pushes[0].data[0]).toBeCloseTo(1);
    expect(pushes[0].data[4]).toBeCloseTo(2);
  });

  it("pushBatch is a no-op for empty arrays", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterColoredHandle(sink, "sc");
    h.pushBatch([]);
    expect(pushes).toHaveLength(0);
  });

  it("pushBatch fills default colorValue/size when omitted", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterColoredHandle(sink, "sc");
    h.pushBatch([{ t: 1, y: 0.1 }]); // no colorValue/size → ?? 0.5 defaults
    expect(pushes[0].data[2]).toBeCloseTo(0.5);
    expect(pushes[0].data[3]).toBeCloseTo(0.5);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new ScatterColoredHandle(sink, "sc");
    const raw = new Float32Array(4);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

describe("HeatmapStreamHandle", () => {
  it("pushColumn encodes [t, ...values] from number array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HeatmapStreamHandle(sink, "hs");
    h.pushColumn(1000, [0.1, 0.5, 0.9]);
    expect(pushes[0].data.length).toBe(4);
    expect(pushes[0].data[0]).toBeCloseTo(1000);
    expect(pushes[0].data[1]).toBeCloseTo(0.1);
    expect(pushes[0].data[3]).toBeCloseTo(0.9);
  });

  it("pushColumn encodes [t, ...values] from Float32Array", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HeatmapStreamHandle(sink, "hs");
    const vals = new Float32Array([0.2, 0.4, 0.6]);
    h.pushColumn(500, vals);
    expect(pushes[0].data.length).toBe(4);
    expect(pushes[0].data[0]).toBeCloseTo(500);
    expect(pushes[0].data[1]).toBeCloseTo(0.2);
    expect(pushes[0].data[3]).toBeCloseTo(0.6);
  });

  it("pushRaw forwards the buffer unchanged", () => {
    const { sink, pushes } = makeFakeSink();
    const h = new HeatmapStreamHandle(sink, "hs");
    const raw = new Float32Array([1, 2, 3]);
    h.pushRaw(raw);
    expect(pushes[0].data).toBe(raw);
  });
});

// Phase 20 — all ring-based streaming handles must expose reset(latestT?)
// symmetrically with LineLayerHandle so consumers can rewind any chart for
// time-travel without dropping down to host.clearLayer().
describe("Ring-based handles: reset()", () => {
  const handlesUnderTest = [
    ["ScatterLayerHandle", ScatterLayerHandle],
    ["AreaLayerHandle", AreaLayerHandle],
    ["StepLayerHandle", StepLayerHandle],
    ["CandlestickLayerHandle", CandlestickLayerHandle],
    ["ScatterColoredHandle", ScatterColoredHandle],
    ["PoseArrowHandle", PoseArrowHandle],
  ] as const;

  for (const [name, Ctor] of handlesUnderTest) {
    it(`${name}.reset(latestT) forwards the rewind to clearLayer`, () => {
      const { sink, clears } = makeFakeSink();
      const h = new Ctor(sink, "x");
      h.reset(7777);
      expect(clears).toEqual([{ id: "x", opts: { latestT: 7777 } }]);
    });

    it(`${name}.reset() without an argument leaves latestT untouched`, () => {
      const { sink, clears } = makeFakeSink();
      const h = new Ctor(sink, "x");
      h.reset();
      expect(clears).toHaveLength(1);
      expect(clears[0].id).toBe("x");
      expect(clears[0].opts?.latestT).toBeUndefined();
    });
  }
});
