import { describe, expect, it } from "vitest";
import { TimelineIndex } from "./timeline-index";

describe("TimelineIndex", () => {
  it("starts empty", () => {
    const idx = new TimelineIndex();
    expect(idx.earliest).toBeNull();
    expect(idx.latest).toBeNull();
  });

  it("insert and retrieve earliest/latest", () => {
    const idx = new TimelineIndex();
    idx.insert(300);
    idx.insert(100);
    idx.insert(200);
    expect(idx.earliest).toBe(100);
    expect(idx.latest).toBe(300);
  });

  it("insert ignores duplicates", () => {
    const idx = new TimelineIndex();
    idx.insert(100);
    idx.insert(100);
    idx.insert(100);
    expect(idx.range(0, 200)).toEqual([100]);
  });

  it("insertMany inserts multiple timestamps", () => {
    const idx = new TimelineIndex();
    idx.insertMany([500, 100, 300, 200, 400]);
    expect(idx.range(0, 1000)).toEqual([100, 200, 300, 400, 500]);
  });

  it("floor returns largest t <= target", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300]);
    expect(idx.floor(250)).toBe(200);
    expect(idx.floor(200)).toBe(200);
    expect(idx.floor(50)).toBeNull();
    expect(idx.floor(400)).toBe(300);
  });

  it("ceiling returns smallest t >= target", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300]);
    expect(idx.ceiling(150)).toBe(200);
    expect(idx.ceiling(200)).toBe(200);
    expect(idx.ceiling(350)).toBeNull();
    expect(idx.ceiling(50)).toBe(100);
  });

  it("range returns inclusive bounds", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300, 400, 500]);
    expect(idx.range(200, 400)).toEqual([200, 300, 400]);
  });

  it("range returns empty for out-of-bounds", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300]);
    expect(idx.range(400, 500)).toEqual([]);
  });

  it("clear resets the index", () => {
    const idx = new TimelineIndex();
    idx.insertMany([1, 2, 3]);
    idx.clear();
    expect(idx.earliest).toBeNull();
    expect(idx.range(0, 100)).toEqual([]);
  });
});
