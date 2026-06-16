import { describe, expect, it } from "vitest";
import { computeAxisTicks, formatTick, formatYTick } from "./axis-ticks";

describe("formatYTick", () => {
  it("defaults to String(value) without a format", () => {
    expect(formatYTick(0.5)).toBe("0.5");
    expect(formatYTick(42, undefined)).toBe("42");
  });

  it("applies a function format directly", () => {
    expect(formatYTick(0.75, (v) => `${v * 100}%`)).toBe("75%");
  });

  it("applies precision via toFixed", () => {
    expect(formatYTick(0.123456, { precision: 2 })).toBe("0.12");
    expect(formatYTick(5, { precision: 1 })).toBe("5.0");
  });

  it("appends a suffix", () => {
    expect(formatYTick(75, { suffix: "%" })).toBe("75%");
    expect(formatYTick(1.5, { precision: 1, suffix: " V" })).toBe("1.5 V");
  });

  it("scales to k/M/G with si", () => {
    expect(formatYTick(1_500, { si: true })).toBe("1.5k");
    expect(formatYTick(2_000_000, { si: true })).toBe("2M");
    expect(formatYTick(3_000_000_000, { si: true })).toBe("3G");
    expect(formatYTick(999, { si: true })).toBe("999");
  });

  it("combines si + precision + suffix", () => {
    expect(formatYTick(1_536, { si: true, precision: 1, suffix: "B" })).toBe("1.5kB");
  });

  it("si handles negative values via absolute magnitude", () => {
    expect(formatYTick(-2_500, { si: true, precision: 1 })).toBe("-2.5k");
  });
});

describe("formatTick", () => {
  it("applies a function format directly regardless of mode", () => {
    expect(formatTick(1234, "fixed", null, (v) => `${v}!`)).toBe("1234!");
    expect(formatTick(1234, "time", 1_000_000, (v) => `${v}!`)).toBe("1234!");
  });

  it("string clock-pattern renders wall-clock in time mode with origin", () => {
    const origin = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
    expect(formatTick(5000, "time", origin, "HH:mm:ss")).toBe("12:00:05");
  });

  it("string falls back to elapsed seconds in time mode without origin", () => {
    expect(formatTick(2500, "time", null, "HH:mm:ss")).toBe("2.5s");
  });

  it("object form with pattern renders wall-clock in time mode", () => {
    const origin = new Date(2026, 0, 1, 9, 30, 0, 0).getTime();
    expect(formatTick(60_000, "time", origin, { pattern: "HH:mm" })).toBe("09:31");
  });

  it("object form formats numerically in fixed mode (precision/suffix/si)", () => {
    expect(formatTick(1234, "fixed", null, { precision: 0, suffix: "ms" })).toBe(
      "1234ms",
    );
    expect(formatTick(1500, "fixed", null, { si: true, precision: 1 })).toBe("1.5k");
  });

  it("object form without pattern formats numerically even in time mode", () => {
    expect(formatTick(2000, "time", 1_000_000, { precision: 1, suffix: "u" })).toBe(
      "2000.0u",
    );
  });
});

describe("computeAxisTicks xTickFormat object form", () => {
  it("formats x labels with an object xTickFormat in fixed mode", () => {
    const { xTicks } = computeAxisTicks({
      xMin: 0,
      xMax: 1000,
      yMin: 0,
      yMax: 10,
      xMode: "fixed",
      xTickFormat: { suffix: "ms" },
    });
    expect(xTicks.length).toBeGreaterThan(0);
    for (const t of xTicks) {
      expect(t.label).toMatch(/ms$/);
    }
  });
});

describe("computeAxisTicks yTickFormat passthrough", () => {
  it("formats y labels with the provided yTickFormat", () => {
    const { yTicks } = computeAxisTicks({
      xMin: 0,
      xMax: 10,
      yMin: 0,
      yMax: 100,
      yTickFormat: { precision: 0, suffix: "%" },
    });
    expect(yTicks.length).toBeGreaterThan(0);
    for (const t of yTicks) {
      expect(t.label).toMatch(/^\d+%$/);
    }
  });

  it("y labels default to String(v) without yTickFormat", () => {
    const { yTicks } = computeAxisTicks({ xMin: 0, xMax: 10, yMin: 0, yMax: 100 });
    for (const t of yTicks) {
      expect(t.label).toBe(String(t.value));
    }
  });
});

describe("computeAxisTicks tick generation branches", () => {
  it("uses xTickIntervalMs when provided (overrides targetTicks)", () => {
    const { xTicks } = computeAxisTicks({
      xMin: 0,
      xMax: 1000,
      yMin: 0,
      yMax: 10,
      xTickIntervalMs: 250,
    });
    expect(xTicks.map((t) => t.value)).toEqual([0, 250, 500, 750, 1000]);
  });

  it("returns empty tick arrays for a non-positive span", () => {
    const { xTicks, yTicks } = computeAxisTicks({
      xMin: 5,
      xMax: 5,
      yMin: 3,
      yMax: 3,
    });
    expect(xTicks).toEqual([]);
    expect(yTicks).toEqual([]);
  });
});
