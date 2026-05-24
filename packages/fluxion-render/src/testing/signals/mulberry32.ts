/**
 * Deterministic pseudo-random number generator (Mulberry32). Given the
 * same seed the returned function produces the same sequence of `[0, 1)`
 * doubles forever — useful for reproducible demos, snapshot-stable test
 * fixtures, and benchmarks where you want jitter without the noise being
 * unbounded.
 *
 * The algorithm is a 32-bit state mixer that passes BigCrush at the
 * statistical level needed for visual demos / load tests. Don't use it for
 * cryptography.
 *
 * @example
 * const rand = mulberry32(42);
 * rand(); // 0.6011037519201636
 * rand(); // 0.4406847085524956
 *
 * // Re-seeding gives the same sequence again:
 * const replay = mulberry32(42);
 * replay() === 0.6011037519201636; // true
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
