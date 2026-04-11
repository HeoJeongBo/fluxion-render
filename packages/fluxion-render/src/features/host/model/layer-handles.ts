/**
 * Type-safe layer handles.
 *
 * These wrap the raw `FluxionHost.pushData(id, Float32Array)` API so callers
 * can work with structured records on the main thread (e.g. after receiving
 * ROS messages or processing sensor frames) without hand-rolling the
 * interleaved Float32Array layout every time.
 *
 * Each handle is a thin encoder: the input shape is type-checked at the call
 * site, encoding to the worker-side layout happens once, and the underlying
 * ArrayBuffer is still transferred zero-copy.
 */

// A minimal surface of `FluxionHost` that handles depend on. Declared here
// so this module has no circular import with fluxion-host.ts.
export interface FluxionDataSink {
  pushData(id: string, data: Float32Array): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Line (streaming) — data layout: [t, y, t, y, ...]
// ────────────────────────────────────────────────────────────────────────────

/** One streaming sample. `t` is host-relative ms (what `axis-grid` time mode expects). */
export interface LineSample {
  t: number;
  y: number;
}

export class LineLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  /** Push a single `[t, y]` sample. Allocates a 2-element Float32Array. */
  push(sample: LineSample): void {
    const buf = new Float32Array(2);
    buf[0] = sample.t;
    buf[1] = sample.y;
    this.sink.pushData(this.id, buf);
  }

  /**
   * Push an array of samples in one postMessage. Encodes into a single
   * contiguous Float32Array and transfers ownership. Prefer this over a loop
   * of `push()` when you already have a batch in hand.
   */
  pushBatch(samples: readonly LineSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      buf[i * 2] = s.t;
      buf[i * 2 + 1] = s.y;
    }
    this.sink.pushData(this.id, buf);
  }

  /**
   * Escape hatch: push a pre-built `[t, y, t, y, ...]` Float32Array directly.
   * Use for hot paths where you can avoid the object-to-array encode step.
   * The TypedArray's byteOffset must be 0 (same rule as `pushData`).
   */
  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Line-static — data layout: [x, y, x, y, ...] or [y0, y1, ...]
// ────────────────────────────────────────────────────────────────────────────

export interface XyPoint {
  x: number;
  y: number;
}

/**
 * Handle for `kind: "line-static"` layers. `setXY` replaces the entire series
 * with a new xy array; `setY` does the same with y-only data (x is computed
 * from the layer's configured x range). Use the variant that matches the
 * layer's `layout` config — this is not enforced at the type level since the
 * worker-side layout is a runtime config.
 */
export class LineStaticLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  setXY(points: readonly XyPoint[]): void {
    const n = points.length;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      buf[i * 2] = p.x;
      buf[i * 2 + 1] = p.y;
    }
    this.sink.pushData(this.id, buf);
  }

  setY(values: readonly number[]): void {
    const buf = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) buf[i] = values[i];
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Lidar — data layout: [x, y, (z), (intensity), ...] with configurable stride
// ────────────────────────────────────────────────────────────────────────────

export interface LidarPoint {
  x: number;
  y: number;
  /** Optional when the layer stride is 2. Defaults to 0 otherwise. */
  z?: number;
  /** Optional when the layer stride is <4. Defaults to 0 otherwise. */
  intensity?: number;
}

export type LidarStride = 2 | 3 | 4;

/**
 * Handle for `kind: "lidar"` scatter layers. The stride (2 = xy, 3 = xyz,
 * 4 = xyz+intensity) must match the layer's stride config. Passing a
 * mismatched stride will succeed but the worker will read the wrong fields.
 */
export class LidarLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
    readonly stride: LidarStride = 4,
  ) {}

  push(points: readonly LidarPoint[]): void {
    const stride = this.stride;
    const n = points.length;
    const buf = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const o = i * stride;
      buf[o] = p.x;
      buf[o + 1] = p.y;
      if (stride >= 3) buf[o + 2] = p.z ?? 0;
      if (stride >= 4) buf[o + 3] = p.intensity ?? 0;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}
