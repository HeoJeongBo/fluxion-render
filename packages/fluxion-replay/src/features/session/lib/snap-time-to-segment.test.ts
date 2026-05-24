import { describe, expect, it } from "vitest";
import { snapTimeToSegment } from "./snap-time-to-segment";

describe("snapTimeToSegment", () => {
  it("returns t unchanged when there are no recorded segments", () => {
    expect(snapTimeToSegment(5_000, [], 10_000)).toBe(5_000);
  });

  it("returns t unchanged when t falls inside a segment", () => {
    expect(
      snapTimeToSegment(5_500, [{ start: 1_000, end: 6_000 }], 10_000),
    ).toBe(5_500);
  });

  it("returns t unchanged when t equals a segment's exact start", () => {
    expect(
      snapTimeToSegment(1_000, [{ start: 1_000, end: 6_000 }], 10_000),
    ).toBe(1_000);
  });

  it("returns t unchanged when t equals a segment's exact end", () => {
    expect(
      snapTimeToSegment(6_000, [{ start: 1_000, end: 6_000 }], 10_000),
    ).toBe(6_000);
  });

  it("treats an open-ended (null end) segment as extending to latest", () => {
    expect(snapTimeToSegment(9_999, [{ start: 0, end: null }], 10_000)).toBe(
      9_999,
    );
  });

  it("forward-snaps a gap target to the next segment's start", () => {
    const segments = [
      { start: 0, end: 2_000 },
      { start: 5_000, end: 8_000 },
    ];
    expect(snapTimeToSegment(3_500, segments, 10_000)).toBe(5_000);
  });

  it("clamps to the last segment's end when t is past every segment", () => {
    const segments = [
      { start: 0, end: 2_000 },
      { start: 5_000, end: 8_000 },
    ];
    expect(snapTimeToSegment(9_500, segments, 10_000)).toBe(8_000);
  });

  it("clamps to latest when the last segment is open-ended and t > latest", () => {
    const segments = [{ start: 0, end: null }];
    expect(snapTimeToSegment(99_999, segments, 10_000)).toBe(10_000);
  });

  it("falls into the FIRST segment when t precedes all starts", () => {
    // t before any segment start → snap to the earliest segment's start.
    const segments = [
      { start: 5_000, end: 6_000 },
      { start: 8_000, end: 9_000 },
    ];
    expect(snapTimeToSegment(2_000, segments, 10_000)).toBe(5_000);
  });

  it("handles three segments and t in the second gap", () => {
    const segments = [
      { start: 0, end: 2_000 },
      { start: 4_000, end: 6_000 },
      { start: 8_000, end: 10_000 },
    ];
    expect(snapTimeToSegment(7_500, segments, 10_000)).toBe(8_000);
  });
});
