import { describe, expect, it } from "vitest";
import { detectGaps } from "./detect-gaps";

describe("detectGaps", () => {
  it("returns [] for empty segments", () => {
    expect(detectGaps([])).toEqual([]);
  });

  it("returns [] for a single segment", () => {
    expect(detectGaps([{ start: 0, end: 5_000 }])).toEqual([]);
  });

  it("detects one gap between two segments", () => {
    const gaps = detectGaps([
      { start: 0, end: 2_000 },
      { start: 5_000, end: 8_000 },
    ]);
    expect(gaps).toEqual([{ start: 2_000, end: 5_000, durationMs: 3_000 }]);
  });

  it("detects multiple gaps", () => {
    const gaps = detectGaps([
      { start: 0, end: 1_000 },
      { start: 3_000, end: 4_000 },
      { start: 7_000, end: 9_000 },
    ]);
    expect(gaps).toEqual([
      { start: 1_000, end: 3_000, durationMs: 2_000 },
      { start: 4_000, end: 7_000, durationMs: 3_000 },
    ]);
  });

  it("handles an open (still-recording) last segment — no gap emitted after it", () => {
    const gaps = detectGaps([
      { start: 0, end: 2_000 },
      { start: 5_000, end: null },
    ]);
    expect(gaps).toEqual([{ start: 2_000, end: 5_000, durationMs: 3_000 }]);
  });

  it("returns [] when segments are contiguous (no gap)", () => {
    const gaps = detectGaps([
      { start: 0, end: 5_000 },
      { start: 5_000, end: 10_000 },
    ]);
    expect(gaps).toEqual([]);
  });

  it("open first segment with no latest — gapStart falls back to current.start", () => {
    // end=null, latest=undefined → gapStart = current.start (0)
    // gapEnd = next.start (5000) > gapStart (0) → gap emitted
    const gaps = detectGaps([
      { start: 0, end: null },
      { start: 5_000, end: 10_000 },
    ]);
    expect(gaps).toEqual([{ start: 0, end: 5_000, durationMs: 5_000 }]);
  });
});
