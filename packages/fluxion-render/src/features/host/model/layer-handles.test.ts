import { describe, expect, it, vi } from "vitest";
import {
  type FluxionDataSink,
  LidarLayerHandle,
  LineLayerHandle,
  LineStaticLayerHandle,
} from "./layer-handles";

function makeFakeSink() {
  const pushes: { id: string; data: Float32Array }[] = [];
  const sink: FluxionDataSink = {
    pushData: vi.fn((id: string, data: Float32Array) => {
      pushes.push({ id, data });
    }),
  };
  return { sink, pushes };
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
