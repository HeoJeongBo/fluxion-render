import { describe, expect, it } from "vitest";
import { WindowExtent } from "./window-extent";

/** Deterministic LCG so a failing case is reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Brute-force min/max over the in-ring (seq ≥ minSeq) in-window (t ≥ xMin) samples. */
function brute(
  all: { seq: number; t: number; y: number }[],
  minSeq: number,
  xMin: number,
): { min: number; max: number } {
  let mn = Number.POSITIVE_INFINITY;
  let mx = Number.NEGATIVE_INFINITY;
  for (const s of all) {
    if (s.seq < minSeq || s.t < xMin) continue;
    if (s.y < mn) mn = s.y;
    if (s.y > mx) mx = s.y;
  }
  return { min: mn, max: mx };
}

describe("WindowExtent", () => {
  it("matches brute-force min/max across random push + query sequences", () => {
    const rand = lcg(0xc0ffee);
    for (let trial = 0; trial < 60; trial++) {
      const cap = 1 + Math.floor(rand() * 40);
      const we = new WindowExtent();
      const all: { seq: number; t: number; y: number }[] = [];
      let t = 0;
      let total = 0; // samples pushed so far
      const pushes = 5 + Math.floor(rand() * 150);
      for (let i = 0; i < pushes; i++) {
        t += 1 + Math.floor(rand() * 5); // strictly increasing time
        const y = Math.floor(rand() * 200) - 100;
        const seq = total;
        all.push({ seq, t, y });
        const minSeq = Math.max(0, total + 1 - cap); // state has total+1 samples
        we.push(seq, t, y, minSeq);
        total++;

        const liveMinSeq = Math.max(0, total - cap);
        // Probe xMin: all in-window, deep past, at the right edge, beyond it.
        for (const xMin of [0, t - cap * 4, t - 1, t, t + 1]) {
          const exp = brute(all, liveMinSeq, xMin);
          expect(we.queryMin(liveMinSeq, xMin)).toBe(exp.min);
          expect(we.queryMax(liveMinSeq, xMin)).toBe(exp.max);
        }
      }
    }
  });

  it("clear resets to empty and is reusable", () => {
    const we = new WindowExtent();
    we.push(0, 10, 5, 0);
    we.push(1, 20, 7, 0);
    we.clear();
    expect(we.queryMin(0, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(we.queryMax(0, 0)).toBe(Number.NEGATIVE_INFINITY);
    we.push(0, 10, 3, 0);
    expect(we.queryMin(0, 0)).toBe(3);
    expect(we.queryMax(0, 0)).toBe(3);
  });

  it("grows the backing arrays for long monotonic runs (no eviction)", () => {
    const we = new WindowExtent();
    // Strictly decreasing y, minSeq stays 0 → the min-deque retains every sample,
    // forcing several grows past the initial capacity.
    for (let i = 0; i < 200; i++) we.push(i, i, 1000 - i, 0);
    expect(we.queryMin(0, 0)).toBe(801); // y at i=199
    expect(we.queryMax(0, 0)).toBe(1000); // y at i=0
  });

  it("returns empty extents when every sample is evicted or scrolled off", () => {
    const we = new WindowExtent();
    we.push(0, 10, 5, 0);
    we.push(1, 20, 8, 0);
    // All evicted (minSeq past the last seq).
    expect(we.queryMin(2, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(we.queryMax(2, 0)).toBe(Number.NEGATIVE_INFINITY);
    // All scrolled off (xMin past the last t).
    expect(we.queryMin(0, 21)).toBe(Number.POSITIVE_INFINITY);
    expect(we.queryMax(0, 21)).toBe(Number.NEGATIVE_INFINITY);
  });
});
