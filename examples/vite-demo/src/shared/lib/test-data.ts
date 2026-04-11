/**
 * Mock ROS2 message generators used by the streaming demo pages.
 *
 * Demos receive these raw message objects (as if from a real subscriber)
 * and convert them to FluxionRender-shaped records via user-owned
 * `transform` functions — the same pattern you'd use when piping
 * rclnodejs / roslib / ros2-web-bridge output into the renderer.
 *
 * Keep these generators deterministic-with-noise so the visual output is
 * still interesting frame-to-frame without being unreproducible.
 */

// ────────────────────────────────────────────────────────────────────────
// Deterministic PRNG (Mulberry32)
// ────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────
// ROS2-style message shapes
// ────────────────────────────────────────────────────────────────────────

/** Equivalent to std_msgs/Header. */
export interface Header {
  stamp: { sec: number; nanosec: number };
  frame_id: string;
}

/**
 * Convert a ROS2 header stamp into host-relative milliseconds. Nanosecond
 * precision is lost (ms is float64), but the chart's ring buffer stores
 * Float32 anyway, so the rounding is below the noise floor.
 */
export function stampToMs(header: Header): number {
  return header.stamp.sec * 1000 + header.stamp.nanosec / 1e6;
}

function buildHeader(tMs: number, frameId: string): Header {
  const sec = Math.floor(tMs / 1000);
  const nanosec = Math.floor((tMs - sec * 1000) * 1e6);
  return { stamp: { sec, nanosec }, frame_id: frameId };
}

/** Lightweight equivalent of std_msgs/Float32Stamped-ish. */
export interface Float32StampedMessage {
  header: Header;
  data: number;
}

/** Equivalent to sensor_msgs/LaserScan. */
export interface LaserScanMessage {
  header: Header;
  angle_min: number;
  angle_max: number;
  angle_increment: number;
  time_increment: number;
  scan_time: number;
  range_min: number;
  range_max: number;
  ranges: Float32Array;
  /** ROS2 permits length 0 (no reflectivity reported). */
  intensities: Float32Array;
}

// ────────────────────────────────────────────────────────────────────────
// Generators (produce raw ROS2-shaped output)
// ────────────────────────────────────────────────────────────────────────

export interface StreamSignalOpts {
  freqHz?: number;
  amplitude?: number;
  /** Phase offset used to stagger series in multi-line demos. */
  seriesOffset?: number;
}

function signalValue(tMs: number, opts: StreamSignalOpts = {}): number {
  const { freqHz = 0.8, amplitude = 1, seriesOffset = 0 } = opts;
  const ts = tMs / 1000;
  const carrier = Math.sin(2 * Math.PI * freqHz * ts + seriesOffset) * amplitude;
  const harmonic =
    Math.sin(2 * Math.PI * freqHz * 2.7 * ts + seriesOffset) * amplitude * 0.4;
  const drift = Math.sin(2 * Math.PI * 0.07 * ts + seriesOffset * 0.5) * 0.3;
  const noise = (globalNoise() - 0.5) * 0.2;
  return carrier + harmonic + drift + noise;
}

/**
 * Single Float32 stamped sample — one mock subscriber callback fire.
 */
export function generateFloat32StampedMessage(
  tMs: number,
  opts: StreamSignalOpts = {},
): Float32StampedMessage {
  return {
    header: buildHeader(tMs, "sensor_frame"),
    data: signalValue(tMs, opts),
  };
}

/**
 * Burst of N stamped samples — simulates a batched subscriber that delivers
 * the last `count` samples at once. Used by the multi-series stress demo.
 */
export function generateFloat32StampedBatch(
  tStartMs: number,
  count: number,
  dtMs: number,
  opts: StreamSignalOpts = {},
): Float32StampedMessage[] {
  const out: Float32StampedMessage[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const t = tStartMs + i * dtMs;
    out[i] = {
      header: buildHeader(t, "sensor_frame"),
      data: signalValue(t, opts),
    };
  }
  return out;
}

/**
 * Rotating mock LaserScan. Produces `pointCount` ray returns per message,
 * with a star-shaped range envelope that slowly morphs with `frame`, plus
 * ~5% outliers to simulate range noise.
 */
export function generateLaserScanMessage(
  frame: number,
  pointCount: number,
  opts: { rangeMax?: number; rangeMin?: number } = {},
): LaserScanMessage {
  const { rangeMax = 30, rangeMin = 0.5 } = opts;
  const ranges = new Float32Array(pointCount);
  const intensities = new Float32Array(pointCount);
  const phase = frame * 0.01;
  const rot = frame * 0.004;
  const angleMin = rot;
  const angleIncrement = (Math.PI * 2) / pointCount;

  for (let i = 0; i < pointCount; i++) {
    const angle = angleMin + i * angleIncrement;
    let r =
      10 +
      Math.sin(angle * 5 + phase) * 4 +
      Math.cos(angle * 2 - phase * 2) * 3 +
      Math.sin(angle * 13 + phase * 0.5) * 1.5;
    // ~5% outlier injection
    if (globalNoise() < 0.05) r += (globalNoise() - 0.5) * 8;
    else r += (globalNoise() - 0.5) * 0.3;
    if (r < rangeMin) r = rangeMin;
    if (r > rangeMax) r = rangeMax;
    ranges[i] = r;
    intensities[i] = Math.min(1, r / rangeMax);
  }

  return {
    header: buildHeader(frame * 8.33, "laser_frame"), // ~120Hz stamp
    angle_min: angleMin,
    angle_max: angleMin + Math.PI * 2,
    angle_increment: angleIncrement,
    time_increment: 1 / 1e6,
    scan_time: 1 / 120,
    range_min: rangeMin,
    range_max: rangeMax,
    ranges,
    intensities,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Static demo helper (not ROS2) — kept for the static-xy demo.
// ────────────────────────────────────────────────────────────────────────

/**
 * One-shot noisy sine over an x range. Returns interleaved xy Float32Array.
 * Used by the static-xy demo which does not consume ROS2 messages.
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

// ────────────────────────────────────────────────────────────────────────
// Host-relative time origin helper (used by AllDemoPage's shared timing)
// ────────────────────────────────────────────────────────────────────────

export function createTimeOrigin(): () => number {
  const t0 = performance.now();
  return () => performance.now() - t0;
}
