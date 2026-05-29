import { describe, expect, it } from "vitest";
import { intervalTicks, niceStep, niceTicks } from "./math";

describe("intervalTicks", () => {
  it("returns ticks at fixed interval boundaries", () => {
    expect(intervalTicks(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("returns empty for invalid inputs", () => {
    expect(intervalTicks(5, 5, 1)).toEqual([]);
    expect(intervalTicks(10, 0, 1)).toEqual([]);
    expect(intervalTicks(Number.NaN, 10, 1)).toEqual([]);
    expect(intervalTicks(0, Number.POSITIVE_INFINITY, 1)).toEqual([]);
    expect(intervalTicks(0, 10, 0)).toEqual([]);
    expect(intervalTicks(0, 10, -1)).toEqual([]);
  });

  it("handles non-zero min", () => {
    const ticks = intervalTicks(1, 5, 1);
    expect(ticks[0]).toBe(1);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(5);
  });
});

describe("niceStep", () => {
  it("returns round step for order-of-magnitude ranges", () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(1, 5)).toBe(0.2);
  });

  it("scales with targetTicks", () => {
    expect(niceStep(10, 10)).toBeLessThanOrEqual(niceStep(10, 5));
  });
});

describe("niceTicks", () => {
  it("produces aligned ticks for 0..10", () => {
    const ticks = niceTicks(0, 10, 5);
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(10);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it("includes both sides for integer ranges", () => {
    const ticks = niceTicks(-10, 10, 5);
    expect(ticks).toContain(0);
  });

  it("returns empty for invalid ranges", () => {
    expect(niceTicks(5, 5)).toEqual([]);
    expect(niceTicks(10, 0)).toEqual([]);
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("handles sub-unit ranges", () => {
    const ticks = niceTicks(0, 1, 5);
    expect(ticks.length).toBeGreaterThan(0);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(1);
  });
});
