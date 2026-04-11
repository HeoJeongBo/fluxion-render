/**
 * Deterministic test-data generators used by the demo pages.
 *
 * These intentionally produce interesting-looking signals (multiple harmonics,
 * drift, noise, bursts, outliers) so the visual output actually exercises the
 * renderer under conditions similar to real robotics sensors.
 *
 * All timestamps are **host-relative milliseconds** (callers should subtract
 * their own `T0 = performance.now()` on start).
 */

/** Host-relative time origin. Store once per demo instance. */
export function createTimeOrigin(): () => number {
  const t0 = performance.now();
  return () => performance.now() - t0;
}

/**
 * Seeded Mulberry32 PRNG. Identical seed -> identical stream.
 * Returned function yields floats in [0, 1).
 */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const globalNoise = rng(0x9e3779b9);

/** Typed streaming sample shape. Matches `LineSample` from the library. */
export interface StreamSample {
  t: number;
  y: number;
}

/**
 * Single streaming sample with multi-frequency sine + slow drift +
 * gaussian-ish noise. `y` stays roughly in `[-1.5, 1.5]`.
 */
export function generateStreamSample(
  tMs: number,
  freqHz = 0.8,
  amplitude = 1,
): StreamSample {
  const t = tMs / 1000;
  const carrier = Math.sin(2 * Math.PI * freqHz * t) * amplitude;
  const harmonic = Math.sin(2 * Math.PI * freqHz * 3.1 * t) * amplitude * 0.3;
  const drift = Math.sin(2 * Math.PI * 0.05 * t) * 0.4;
  const noise = (globalNoise() - 0.5) * 0.15;
  return { t: tMs, y: carrier + harmonic + drift + noise };
}

/**
 * Burst of `count` typed samples spanning `dtMs` per sample, starting at
 * `tStartMs`. Used by the multi-stream demo to stress-push hundreds of
 * samples per interval tick — caller forwards to `line.pushBatch(...)`.
 */
export function generateStreamBatch(
  tStartMs: number,
  count: number,
  dtMs: number,
  opts: { seriesOffset?: number; freqHz?: number; amplitude?: number } = {},
): StreamSample[] {
  const { seriesOffset = 0, freqHz = 1, amplitude = 1 } = opts;
  const out: StreamSample[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = tStartMs + i * dtMs;
    const ts = t / 1000;
    const carrier = Math.sin(2 * Math.PI * freqHz * ts + seriesOffset) * amplitude;
    const harmonic =
      Math.sin(2 * Math.PI * freqHz * 2.7 * ts + seriesOffset) * amplitude * 0.4;
    const drift = Math.sin(2 * Math.PI * 0.07 * ts + seriesOffset * 0.5) * 0.3;
    const noise = (globalNoise() - 0.5) * 0.2;
    out[i] = { t, y: carrier + harmonic + drift + noise };
  }
  return out;
}

/**
 * One-shot xy dataset for the static demo: a noisy sine over an x-range.
 * Returns interleaved `[x0, y0, x1, y1, ...]` of length `n * 2`.
 */
export function generateStaticSineXY(
  n: number,
  xMin: number,
  xMax: number,
  seed = 1,
): Float32Array {
  const local = rng(seed);
  const out = new Float32Array(n * 2);
  const span = xMax - xMin;
  for (let i = 0; i < n; i++) {
    const x = xMin + (i / (n - 1)) * span;
    const y = Math.sin(x * 2) * 0.8 + Math.cos(x * 0.7) * 0.2 + (local() - 0.5) * 0.08;
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

/**
 * Rotating 2D LiDAR scan stressing renderer with `pointCount` points per frame.
 *
 * Geometry: star-shaped obstacle field that slowly morphs via `frame`-driven
 * phase, plus ~5% random outliers to simulate range noise. Output is
 * `[x, y, z, intensity, ...]` stride=4.
 */
export function generateLidarScan(
  frame: number,
  pointCount: number,
  opts: { rangeMax?: number } = {},
): Float32Array {
  const { rangeMax = 30 } = opts;
  const out = new Float32Array(pointCount * 4);
  const phase = frame * 0.01;
  const rot = frame * 0.004;
  for (let i = 0; i < pointCount; i++) {
    const baseAngle = (i / pointCount) * Math.PI * 2;
    const angle = baseAngle + rot;
    // Star-shaped range varying with angle and phase
    let r =
      10 +
      Math.sin(angle * 5 + phase) * 4 +
      Math.cos(angle * 2 - phase * 2) * 3 +
      Math.sin(angle * 13 + phase * 0.5) * 1.5;
    // Outlier injection ~5%
    const roll = globalNoise();
    if (roll < 0.05) r += (globalNoise() - 0.5) * 8;
    else r += (globalNoise() - 0.5) * 0.3;
    if (r < 0.5) r = 0.5;
    if (r > rangeMax) r = rangeMax;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const intensity = Math.min(1, r / rangeMax);
    const o = i * 4;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = 0;
    out[o + 3] = intensity;
  }
  return out;
}
