import { describe, expect, it } from "vitest";
import { RingBuffer } from "../model/ring-buffer";
import { Viewport } from "../model/viewport";
import { forEachColumn } from "./column-reduce";

function makeViewport() {
  const v = new Viewport();
  v.setSize(100, 100, 1);
  v.setBounds({ xMin: 0, xMax: 100, yMin: 0, yMax: 100 });
  return v;
}

function ringOf(samples: Array<[number, number]>): RingBuffer {
  const r = new RingBuffer(samples.length + 1, 2);
  for (const [t, y] of samples) r.push([t, y]);
  return r;
}

type Col = [colPx: number, firstY: number, minY: number, maxY: number, lastY: number];

describe("forEachColumn", () => {
  it("aggregates first/min/max/last for samples in the same pixel column", () => {
    const vp = makeViewport();
    const ring = ringOf([
      [0, 5],
      [0.1, 1],
      [0.2, 9],
    ]);
    const cols: Col[] = [];
    forEachColumn(ring, vp, vp.bounds.xMin, undefined, {
      onColumn: (colPx, firstY, minY, maxY, lastY) =>
        cols.push([colPx, firstY, minY, maxY, lastY]),
    });
    expect(cols.length).toBe(1);
    const [, firstY, minY, maxY, lastY] = cols[0]!;
    expect(firstY).toBe(5);
    expect(minY).toBe(1);
    expect(maxY).toBe(9);
    expect(lastY).toBe(9);
  });

  it("emits a separate aggregate per distinct pixel column", () => {
    const vp = makeViewport();
    const ring = ringOf([
      [0, 1],
      [50, 2],
      [99, 3],
    ]);
    const cols: Col[] = [];
    forEachColumn(ring, vp, vp.bounds.xMin, undefined, {
      onColumn: (...a) => cols.push(a as unknown as Col),
    });
    expect(cols.length).toBe(3);
  });

  it("skips samples older than xMin", () => {
    const vp = makeViewport();
    const ring = ringOf([
      [0, 1],
      [10, 2],
      [60, 3],
    ]);
    const cols: Col[] = [];
    forEachColumn(ring, vp, 50, undefined, {
      onColumn: (...a) => cols.push(a as unknown as Col),
    });
    // Only the t=60 sample is at/after xMin=50.
    expect(cols.length).toBe(1);
    expect(cols[0]![1]).toBe(3);
  });

  it("fires onGapBreak and splits when a time gap exceeds the threshold", () => {
    const vp = makeViewport();
    const ring = ringOf([
      [0, 1],
      [1, 2],
    ]);
    const cols: Col[] = [];
    let breaks = 0;
    forEachColumn(ring, vp, vp.bounds.xMin, 0.5, {
      onColumn: (...a) => cols.push(a as unknown as Col),
      onGapBreak: () => {
        breaks++;
      },
    });
    expect(breaks).toBe(1);
    expect(cols.length).toBe(2);
  });

  it("tolerates a missing onGapBreak callback (optional)", () => {
    const vp = makeViewport();
    const ring = ringOf([
      [0, 1],
      [1, 2],
    ]);
    const cols: Col[] = [];
    expect(() =>
      forEachColumn(ring, vp, vp.bounds.xMin, 0.5, {
        onColumn: (...a) => cols.push(a as unknown as Col),
      }),
    ).not.toThrow();
    expect(cols.length).toBe(2);
  });

  it("never calls onColumn for an empty ring", () => {
    const vp = makeViewport();
    const ring = new RingBuffer(4, 2);
    let calls = 0;
    forEachColumn(ring, vp, vp.bounds.xMin, undefined, {
      onColumn: () => {
        calls++;
      },
    });
    expect(calls).toBe(0);
  });
});
