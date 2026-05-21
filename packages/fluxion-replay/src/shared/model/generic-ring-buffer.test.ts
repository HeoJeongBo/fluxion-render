import { describe, expect, it } from "vitest";
import { GenericRingBuffer } from "./generic-ring-buffer";

describe("GenericRingBuffer", () => {
  it("starts empty", () => {
    const buf = new GenericRingBuffer<number>(4);
    expect(buf.length).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("throws for capacity < 1", () => {
    expect(() => new GenericRingBuffer<number>(0)).toThrow(RangeError);
  });

  it("pushes items and reads them in order", () => {
    const buf = new GenericRingBuffer<number>(4);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.length).toBe(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
  });

  it("evicts oldest when capacity is exceeded", () => {
    const buf = new GenericRingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // evicts 1
    expect(buf.length).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it("at() returns correct item by logical index", () => {
    const buf = new GenericRingBuffer<number>(3);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    buf.push(40); // evicts 10
    expect(buf.at(0)).toBe(20);
    expect(buf.at(1)).toBe(30);
    expect(buf.at(2)).toBe(40);
    expect(buf.at(3)).toBeUndefined();
  });

  it("at() returns undefined for out-of-bounds index", () => {
    const buf = new GenericRingBuffer<number>(4);
    buf.push(1);
    expect(buf.at(-1)).toBeUndefined();
    expect(buf.at(1)).toBeUndefined();
  });

  it("forEach iterates oldest-first after wrap-around", () => {
    const buf = new GenericRingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => buf.push(n));
    const result: number[] = [];
    buf.forEach((item) => result.push(item));
    expect(result).toEqual([3, 4, 5]);
  });

  it("evictWhile removes from oldest end", () => {
    const buf = new GenericRingBuffer<number>(5);
    [1, 2, 3, 4, 5].forEach((n) => buf.push(n));
    buf.evictWhile((x) => x <= 3);
    expect(buf.toArray()).toEqual([4, 5]);
  });

  it("evictWhile stops at first non-matching item", () => {
    const buf = new GenericRingBuffer<number>(5);
    [1, 3, 5, 7].forEach((n) => buf.push(n));
    buf.evictWhile((x) => x < 3);
    expect(buf.toArray()).toEqual([3, 5, 7]);
  });

  it("evictWhile on empty buffer is a no-op", () => {
    const buf = new GenericRingBuffer<number>(4);
    expect(() => buf.evictWhile(() => true)).not.toThrow();
    expect(buf.length).toBe(0);
  });

  it("clear resets the buffer", () => {
    const buf = new GenericRingBuffer<number>(4);
    [1, 2, 3].forEach((n) => buf.push(n));
    buf.clear();
    expect(buf.length).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it("works with objects", () => {
    const buf = new GenericRingBuffer<{ t: number; v: string }>(3);
    buf.push({ t: 100, v: "a" });
    buf.push({ t: 200, v: "b" });
    expect(buf.toArray()).toEqual([
      { t: 100, v: "a" },
      { t: 200, v: "b" },
    ]);
  });

  it("handles capacity of 1", () => {
    const buf = new GenericRingBuffer<number>(1);
    buf.push(1);
    buf.push(2);
    expect(buf.length).toBe(1);
    expect(buf.toArray()).toEqual([2]);
  });
});
