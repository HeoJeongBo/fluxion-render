import { describe, expect, it, vi } from "vitest";
import {
  type FluxionDataSink,
  LidarLayerHandle,
  LineLayerHandle,
  LineStaticLayerHandle,
  PoseArrowHandle,
  ReferenceLineHandle,
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
