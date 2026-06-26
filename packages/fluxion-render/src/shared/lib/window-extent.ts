/**
 * Sliding-window minimum & maximum of a streaming value, in amortized O(1) per
 * push and per query. Replaces the O(n) full-ring rescan that streaming layers
 * ran every frame to find their visible-window y-extent (the dominant worker-CPU
 * cost at 100+ charts: O(ring × charts × fps)).
 *
 * Model: samples arrive in time order, each with a monotonically increasing
 * index `seq` and a time `t`. A query asks for the min/max over samples that are
 * BOTH still in the backing ring (`seq >= minSeq`, i.e. not yet evicted by
 * capacity) AND inside the time window (`t >= xMin`, i.e. not scrolled off the
 * left). Two monotonic deques drop dominated samples on push and stale samples
 * (by seq, then by t) from the front, so a query returns exactly what a
 * brute-force min/max over the in-ring, in-window samples would — without
 * scanning them.
 *
 * The deques only ever hold a subset of the live window (dominated samples are
 * discarded), so they stay small for noisy data; the backing arrays grow lazily
 * and are reused (no per-frame allocation).
 */

/** One monotonic deque. `dir: 1` keeps the front as the minimum; `-1` the max. */
class MonoDeque {
  private seq: Float64Array;
  private t: Float64Array;
  private val: Float64Array;
  private head = 0;
  private size = 0;

  constructor(
    private readonly dir: 1 | -1,
    cap = 16,
  ) {
    this.seq = new Float64Array(cap);
    this.t = new Float64Array(cap);
    this.val = new Float64Array(cap);
  }

  private grow(): void {
    const cap = this.seq.length;
    const nseq = new Float64Array(cap * 2);
    const nt = new Float64Array(cap * 2);
    const nval = new Float64Array(cap * 2);
    for (let i = 0; i < this.size; i++) {
      const s = (this.head + i) % cap;
      nseq[i] = this.seq[s]!;
      nt[i] = this.t[s]!;
      nval[i] = this.val[s]!;
    }
    this.seq = nseq;
    this.t = nt;
    this.val = nval;
    this.head = 0;
  }

  push(seq: number, t: number, val: number, minSeq: number): void {
    const cap0 = this.seq.length;
    // Drop front samples already evicted from the ring. `minSeq` only ever
    // increases (push count grows), so this front-pop is permanent and safe — it
    // bounds the deque to the live window so the backing array doesn't grow past
    // it. (The time-window filter, in contrast, is NON-mutating — see `query` —
    // because `xMin` can move backward on a replay seek / resize.)
    while (this.size > 0 && this.seq[this.head]! < minSeq) {
      this.head = (this.head + 1) % cap0;
      this.size--;
    }
    // Drop back samples the newcomer dominates (≥ for min, ≤ for max): a later
    // sample with an equal-or-more-extreme value is the answer for every future
    // window that contains the dominated one, so it can never be selected.
    while (this.size > 0) {
      const bi = (this.head + this.size - 1) % this.seq.length;
      const dominated = this.dir === 1 ? this.val[bi]! >= val : this.val[bi]! <= val;
      if (!dominated) break;
      this.size--;
    }
    if (this.size === this.seq.length) this.grow();
    const cap = this.seq.length;
    const wi = (this.head + this.size) % cap;
    this.seq[wi] = seq;
    this.t[wi] = t;
    this.val[wi] = val;
    this.size++;
  }

  /**
   * Value of the first deque entry with `seq >= minSeq && t >= xMin`, or the
   * appropriate infinity if none. NON-mutating (binary search): entries are
   * sorted ascending by both seq and t, and the deque's value is monotonic, so
   * the first in-window entry IS the window min (min-deque) / max (max-deque).
   * Read-only so it's correct even when `xMin` is queried out of order.
   */
  query(minSeq: number, xMin: number): number {
    const cap = this.seq.length;
    let lo = 0;
    let hi = this.size;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const idx = (this.head + mid) % cap;
      if (this.seq[idx]! >= minSeq && this.t[idx]! >= xMin) hi = mid;
      else lo = mid + 1;
    }
    if (lo >= this.size) {
      return this.dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    return this.val[(this.head + lo) % cap]!;
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }
}

export class WindowExtent {
  private readonly minDq = new MonoDeque(1);
  private readonly maxDq = new MonoDeque(-1);
  private prevT = Number.NEGATIVE_INFINITY;
  private warnedNonMonotonic = false;

  /**
   * Feed one sample. Call in **time order** (strictly increasing `seq`, and `t`
   * never decreasing) — the {@link queryMin}/{@link queryMax} binary search
   * relies on the deques being sorted ascending by `t`, so a backward `t` (e.g.
   * a replay seek that forgot to {@link clear}) would yield wrong extents.
   * `minSeq` is the lowest sequence still retained by the backing ring
   * (`totalPushed - capacity`, clamped at 0) so evicted samples are dropped.
   * A non-monotonic `t` is warned once (per instance) rather than silently
   * corrupting the window.
   */
  push(seq: number, t: number, value: number, minSeq: number): void {
    if (t < this.prevT && !this.warnedNonMonotonic) {
      this.warnedNonMonotonic = true;
      console.warn(
        `[fluxion] WindowExtent got a non-monotonic timestamp (t=${t} < previous ` +
          `${this.prevT}). Sliding-window min/max assumes time-ordered samples; ` +
          "results may be wrong. Push in time order and clear() on a backward seek.",
      );
    }
    this.prevT = t;
    this.minDq.push(seq, t, value, minSeq);
    this.maxDq.push(seq, t, value, minSeq);
  }

  /** Window minimum over {seq >= minSeq AND t >= xMin}; +Infinity if empty. */
  queryMin(minSeq: number, xMin: number): number {
    return this.minDq.query(minSeq, xMin);
  }

  /** Window maximum over {seq >= minSeq AND t >= xMin}; -Infinity if empty. */
  queryMax(minSeq: number, xMin: number): number {
    return this.maxDq.query(minSeq, xMin);
  }

  /** Reset to empty (e.g. ring cleared / replay seek). Re-arms the monotonic guard. */
  clear(): void {
    this.minDq.clear();
    this.maxDq.clear();
    this.prevT = Number.NEGATIVE_INFINITY;
    this.warnedNonMonotonic = false;
  }
}
