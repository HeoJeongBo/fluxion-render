import { describe, expect, it } from "vitest";
import { RingBuffer } from "./ring-buffer";

describe("RingBuffer", () => {
  it("starts empty", () => {
    const rb = new RingBuffer(4, 1);
    expect(rb.length).toBe(0);
    const seen: number[] = [];
    rb.forEach((data, off) => seen.push(data[off]));
    expect(seen).toEqual([]);
  });

  it("push appends stride=1 records", () => {
    const rb = new RingBuffer(4, 1);
    rb.push([10]);
    rb.push([20]);
    rb.push([30]);
    expect(rb.length).toBe(3);
    const seen: number[] = [];
    rb.forEach((data, off) => seen.push(data[off]));
    expect(seen).toEqual([10, 20, 30]);
  });

  it("overflows: keeps most recent records in chronological order", () => {
    const rb = new RingBuffer(3, 1);
    for (let i = 1; i <= 7; i++) rb.push([i]);
    expect(rb.length).toBe(3);
    const seen: number[] = [];
    rb.forEach((data, off) => seen.push(data[off]));
    expect(seen).toEqual([5, 6, 7]);
  });

  it("pushMany with stride=2 stores records correctly", () => {
    const rb = new RingBuffer(3, 2);
    rb.pushMany(new Float32Array([1, 2, 3, 4, 5, 6]));
    expect(rb.length).toBe(3);
    const pairs: [number, number][] = [];
    rb.forEach((data, off) => pairs.push([data[off], data[off + 1]]));
    expect(pairs).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("pushMany then overflow preserves latest records", () => {
    const rb = new RingBuffer(2, 2);
    rb.pushMany(new Float32Array([1, 1, 2, 2, 3, 3, 4, 4]));
    const pairs: [number, number][] = [];
    rb.forEach((data, off) => pairs.push([data[off], data[off + 1]]));
    expect(pairs).toEqual([
      [3, 3],
      [4, 4],
    ]);
  });

  it("forEach exposes the chronological index", () => {
    const rb = new RingBuffer(3, 1);
    rb.push([100]);
    rb.push([200]);
    const indices: number[] = [];
    rb.forEach((_d, _o, idx) => indices.push(idx));
    expect(indices).toEqual([0, 1]);
  });

  it("clear resets length and makes forEach a no-op", () => {
    const rb = new RingBuffer(3, 1);
    rb.push([1]);
    rb.push([2]);
    rb.clear();
    expect(rb.length).toBe(0);
    let calls = 0;
    rb.forEach(() => calls++);
    expect(calls).toBe(0);
  });
});
