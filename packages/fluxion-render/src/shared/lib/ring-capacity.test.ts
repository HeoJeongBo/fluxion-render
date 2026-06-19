import { describe, expect, it } from "vitest";
import { computeRingCapacity } from "./ring-capacity";

describe("computeRingCapacity", () => {
  it("returns an explicit capacity verbatim (wins over retention/rate)", () => {
    expect(computeRingCapacity({ capacity: 1024 })).toBe(1024);
    expect(computeRingCapacity({ capacity: 1024, retentionMs: 10_000, maxHz: 60 })).toBe(
      1024,
    );
  });

  it("derives from retentionMs + maxHz with 10% headroom", () => {
    // 5s window @ 60Hz = 300 samples × 1.1 = 330.
    expect(computeRingCapacity({ retentionMs: 5_000, maxHz: 60 })).toBe(330);
    // ceil rounds up.
    expect(computeRingCapacity({ retentionMs: 1_000, maxHz: 7 })).toBe(Math.ceil(7.7));
  });

  it("returns undefined when neither capacity nor retention+rate is present", () => {
    expect(computeRingCapacity({})).toBeUndefined();
    expect(computeRingCapacity({ retentionMs: 5_000 })).toBeUndefined();
    expect(computeRingCapacity({ maxHz: 60 })).toBeUndefined();
  });
});
