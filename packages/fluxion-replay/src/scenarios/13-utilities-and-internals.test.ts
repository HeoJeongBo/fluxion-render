/**
 * Scenario 13: Utilities & Internals Unit Tests
 *
 * Closes test coverage gaps identified in a full codebase review:
 *
 * A. detectGaps()       — zero tests existed; 4 cases added
 * B. snapTimeToSegment() — zero tests existed; 4 cases added
 * C. GenericRingBuffer  — evictWhile / at / toArray / wrap-around untested; 5 cases
 * D. TimelineIndex      — ceiling / range / insertMany / dedup untested; 5 cases
 *
 * Also documents two behaviours found during the review:
 *   - onEnd leaves player in "paused" state (not "stopped") — design intent
 *   - stop() → play() always restarts from earliest (VirtualClock.stop() zeroes
 *     _startVirtualMs, so a subsequent seek() before play() IS honoured, but
 *     seek() → stop() → play() discards the seek)
 */
import { describe, expect, it } from "vitest";
import { detectGaps } from "../features/session/lib/detect-gaps";
import { snapTimeToSegment } from "../features/session/lib/snap-time-to-segment";
import { TimelineIndex } from "../features/timeline/model/timeline-index";
import { GenericRingBuffer } from "../shared/model/generic-ring-buffer";

// ---------------------------------------------------------------------------
// Group A: detectGaps
// ---------------------------------------------------------------------------

describe("detectGaps", () => {
  it("A1: empty segments → no gaps", () => {
    expect(detectGaps([])).toEqual([]);
  });

  it("A2: single segment → no gaps", () => {
    expect(detectGaps([{ start: 0, end: 5_000 }])).toEqual([]);
  });

  it("A3: two closed segments separated by a gap", () => {
    const gaps = detectGaps([
      { start: 0, end: 2_000 },
      { start: 5_000, end: 8_000 },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ start: 2_000, end: 5_000, durationMs: 3_000 });
  });

  it("A4: three segments → two gaps", () => {
    const gaps = detectGaps([
      { start: 0, end: 1_000 },
      { start: 3_000, end: 4_000 },
      { start: 7_000, end: 8_000 },
    ]);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({ start: 1_000, end: 3_000, durationMs: 2_000 });
    expect(gaps[1]).toEqual({ start: 4_000, end: 7_000, durationMs: 3_000 });
  });

  it("A5: open segment (end=null) uses latest for gap start", () => {
    // Segment A ends at 2_000; segment B starts at 5_000.
    // Segment A has end=null → gap start is resolved via the latest param.
    const gaps = detectGaps(
      [
        { start: 0, end: null },
        { start: 5_000, end: 8_000 },
      ],
      2_000, // latest
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ start: 2_000, end: 5_000, durationMs: 3_000 });
  });

  it("A6: contiguous segments (no gap between them) → no gaps", () => {
    const gaps = detectGaps([
      { start: 0, end: 3_000 },
      { start: 3_000, end: 6_000 },
    ]);
    expect(gaps).toHaveLength(0);
  });

  it("A7: unsorted input is handled correctly (defensive sort)", () => {
    // Segments provided in reverse order — result must be identical to sorted input.
    const gaps = detectGaps([
      { start: 5_000, end: 8_000 },
      { start: 0, end: 2_000 },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ start: 2_000, end: 5_000, durationMs: 3_000 });
  });
});

// ---------------------------------------------------------------------------
// Group B: snapTimeToSegment
// ---------------------------------------------------------------------------

describe("snapTimeToSegment", () => {
  const LATEST = 10_000;

  it("B1: t inside a segment is returned unchanged", () => {
    const segments = [{ start: 0, end: 5_000 }, { start: 7_000, end: 10_000 }];
    expect(snapTimeToSegment(2_500, segments, LATEST)).toBe(2_500);
    expect(snapTimeToSegment(8_000, segments, LATEST)).toBe(8_000);
  });

  it("B2: t at exact segment boundaries is considered inside", () => {
    const segments = [{ start: 1_000, end: 4_000 }];
    expect(snapTimeToSegment(1_000, segments, LATEST)).toBe(1_000);
    expect(snapTimeToSegment(4_000, segments, LATEST)).toBe(4_000);
  });

  it("B3: t in a gap snaps forward to the next segment start", () => {
    const segments = [
      { start: 0, end: 2_000 },
      { start: 5_000, end: 8_000 },
    ];
    expect(snapTimeToSegment(3_000, segments, LATEST)).toBe(5_000);
  });

  it("B4: t past the last segment clamps to its end", () => {
    const segments = [{ start: 0, end: 3_000 }];
    expect(snapTimeToSegment(9_000, segments, LATEST)).toBe(3_000);
  });

  it("B5: open segment (end=null) — t within [start, latest] is inside, returned unchanged", () => {
    // The open segment's effective end = latest (10_000).
    // t=9_000 < latest=10_000 → still inside the open segment → t returned as-is.
    const segments = [{ start: 0, end: null }];
    expect(snapTimeToSegment(9_000, segments, LATEST)).toBe(9_000);
    // t exactly at latest is also inside.
    expect(snapTimeToSegment(LATEST, segments, LATEST)).toBe(LATEST);
  });

  it("B6: t inside an open segment (end=null) is returned unchanged", () => {
    const segments = [{ start: 0, end: null }];
    expect(snapTimeToSegment(5_000, segments, LATEST)).toBe(5_000);
  });

  it("B7: empty segments → t unchanged", () => {
    expect(snapTimeToSegment(42, [], LATEST)).toBe(42);
  });

  it("B8: unsorted input is handled correctly (defensive sort)", () => {
    // t=3_000 falls in the gap between [0,2000] and [5000,8000].
    // Even if provided in reverse order the forward-snap should go to 5_000.
    const segments = [
      { start: 5_000, end: 8_000 },
      { start: 0, end: 2_000 },
    ];
    expect(snapTimeToSegment(3_000, segments, LATEST)).toBe(5_000);
    // t inside first segment in real order (0..2000) should return t unchanged.
    expect(snapTimeToSegment(1_000, segments, LATEST)).toBe(1_000);
  });
});

// ---------------------------------------------------------------------------
// Group C: GenericRingBuffer
// ---------------------------------------------------------------------------

describe("GenericRingBuffer", () => {
  it("C1: capacity exceeded — oldest entry is overwritten", () => {
    const buf = new GenericRingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // overwrites 1
    expect(buf.length).toBe(3);
    expect(buf.toArray()).toEqual([2, 3, 4]);
  });

  it("C2: at(i) is accurate after wrap-around", () => {
    const buf = new GenericRingBuffer<number>(3);
    buf.push(10);
    buf.push(20);
    buf.push(30);
    buf.push(40); // head wraps; oldest = 20
    expect(buf.at(0)).toBe(20); // oldest
    expect(buf.at(1)).toBe(30);
    expect(buf.at(2)).toBe(40); // newest
    expect(buf.at(3)).toBeUndefined(); // out of range
  });

  it("C3: evictWhile removes entries from the oldest end while predicate holds", () => {
    const buf = new GenericRingBuffer<number>(5);
    [1, 2, 3, 4, 5].forEach((n) => buf.push(n));
    buf.evictWhile((n) => n < 4); // evict 1, 2, 3
    expect(buf.length).toBe(2);
    expect(buf.toArray()).toEqual([4, 5]);
  });

  it("C4: evictWhile stops as soon as predicate returns false", () => {
    const buf = new GenericRingBuffer<number>(5);
    [1, 3, 5, 7, 9].forEach((n) => buf.push(n));
    buf.evictWhile((n) => n < 5); // evicts 1, 3; stops at 5
    expect(buf.toArray()).toEqual([5, 7, 9]);
  });

  it("C5: toArray returns items oldest-first", () => {
    const buf = new GenericRingBuffer<string>(4);
    ["a", "b", "c"].forEach((s) => buf.push(s));
    expect(buf.toArray()).toEqual(["a", "b", "c"]);
  });

  it("C6: clear resets length to 0 and forEach visits nothing", () => {
    const buf = new GenericRingBuffer<number>(5);
    [1, 2, 3].forEach((n) => buf.push(n));
    buf.clear();
    expect(buf.length).toBe(0);
    const visited: number[] = [];
    buf.forEach((n) => visited.push(n));
    expect(visited).toHaveLength(0);
  });

  it("C7: capacity=1 always keeps only the latest item", () => {
    const buf = new GenericRingBuffer<number>(1);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.length).toBe(1);
    expect(buf.at(0)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Group D: TimelineIndex
// ---------------------------------------------------------------------------

describe("TimelineIndex", () => {
  it("D1: insert deduplicates — same t inserted twice appears once", () => {
    const idx = new TimelineIndex();
    idx.insert(100);
    idx.insert(100);
    expect(idx.range(0, 200)).toEqual([100]);
  });

  it("D2: insertMany adds multiple values in sorted order", () => {
    const idx = new TimelineIndex();
    idx.insertMany([300, 100, 200]);
    expect(idx.range(0, 400)).toEqual([100, 200, 300]);
  });

  it("D3: floor returns the largest t <= target", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300]);
    expect(idx.floor(250)).toBe(200);
    expect(idx.floor(300)).toBe(300);
    expect(idx.floor(50)).toBeNull(); // nothing ≤ 50
  });

  it("D4: ceiling returns the smallest t >= target", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300]);
    expect(idx.ceiling(150)).toBe(200);
    expect(idx.ceiling(200)).toBe(200);
    expect(idx.ceiling(350)).toBeNull(); // nothing ≥ 350
  });

  it("D5: range returns all t in [from, to] inclusive", () => {
    const idx = new TimelineIndex();
    idx.insertMany([100, 200, 300, 400, 500]);
    expect(idx.range(200, 400)).toEqual([200, 300, 400]);
    expect(idx.range(200, 200)).toEqual([200]);
    expect(idx.range(600, 700)).toEqual([]);
  });

  it("D6: earliest and latest reflect the true bounds", () => {
    const idx = new TimelineIndex();
    expect(idx.earliest).toBeNull();
    expect(idx.latest).toBeNull();
    idx.insertMany([50, 150, 300]);
    expect(idx.earliest).toBe(50);
    expect(idx.latest).toBe(300);
  });

  it("D7: clear removes all entries", () => {
    const idx = new TimelineIndex();
    idx.insertMany([1, 2, 3]);
    idx.clear();
    expect(idx.earliest).toBeNull();
    expect(idx.range(0, 100)).toEqual([]);
  });
});
