import { describe, expect, it } from "vitest";
import { mulberry32 } from "./mulberry32";

describe("mulberry32", () => {
  it("returns numbers in [0, 1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic — same seed → identical sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds diverge immediately", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("output spans the unit interval reasonably evenly", () => {
    const r = mulberry32(7);
    const buckets = new Array(10).fill(0) as number[];
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const v = r();
      buckets[Math.min(9, Math.floor(v * 10))]!++;
    }
    // Expect each bucket within ±2% of the uniform expectation.
    const expected = n / 10;
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.02);
    }
  });

  it("32-bit seed wrap is supported (negative seed equivalent to seed >>> 0)", () => {
    const a = mulberry32(-1); // becomes 0xFFFFFFFF after >>> 0
    const b = mulberry32(0xffffffff);
    expect(a()).toBe(b());
  });
});
