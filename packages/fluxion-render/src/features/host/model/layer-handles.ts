import type { ReferenceLineConfig } from "../../../entities/reference-line-layer";

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
  configLayer(id: string, config: unknown): void;
  clearLayer(id: string, opts?: { latestT?: number }): void;
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

  /**
   * Drop the layer's ring buffer and (optionally) rewind the worker-side
   * time axis to `latestT`. Use when a replay player seeks backward and
   * the chart needs to re-hydrate from a store at the seek point:
   *
   * ```ts
   * handle.reset(seekT);                  // wipe + rewind axis
   * handle.pushBatch(backfillSamples);    // refill with [seekT - windowMs, seekT]
   * ```
   *
   * Omitting `latestT` leaves the axis where it was — useful when you're
   * about to push fresh batches that will advance time forward anyway.
   */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
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

// ────────────────────────────────────────────────────────────────────────────
// Scatter (streaming) — data layout: [t, y, t, y, ...] stride=2
// Same layout as LineLayerHandle; different layer kind = different draw call.
// ────────────────────────────────────────────────────────────────────────────

/** One scatter sample. `t` is host-relative ms (same origin as `LineSample`). */
export interface ScatterSample {
  t: number;
  y: number;
}

/**
 * Handle for `kind: "scatter"` layers. Appends to the layer's ring buffer
 * on each call — identical wire format to `LineLayerHandle` but rendered
 * as individual points rather than a connected line.
 */
export class ScatterLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  /** Push a single `[t, y]` sample. */
  push(sample: ScatterSample): void {
    const buf = new Float32Array(2);
    buf[0] = sample.t;
    buf[1] = sample.y;
    this.sink.pushData(this.id, buf);
  }

  /** Push a batch of samples in one postMessage. */
  pushBatch(samples: readonly ScatterSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      buf[i * 2] = s.t;
      buf[i * 2 + 1] = s.y;
    }
    this.sink.pushData(this.id, buf);
  }

  /**
   * Escape hatch: push a pre-built `[t, y, t, y, ...]` Float32Array directly.
   * The array's byteOffset must be 0.
   */
  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Area (streaming) — same wire format as Line: [t, y, t, y, ...] stride=2
// ────────────────────────────────────────────────────────────────────────────

export class AreaLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  push(sample: LineSample): void {
    const buf = new Float32Array(2);
    buf[0] = sample.t;
    buf[1] = sample.y;
    this.sink.pushData(this.id, buf);
  }

  pushBatch(samples: readonly LineSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      buf[i * 2] = samples[i]!.t;
      buf[i * 2 + 1] = samples[i]!.y;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step (streaming) — same wire format as Line: [t, y, t, y, ...] stride=2
// ────────────────────────────────────────────────────────────────────────────

export class StepLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  push(sample: LineSample): void {
    const buf = new Float32Array(2);
    buf[0] = sample.t;
    buf[1] = sample.y;
    this.sink.pushData(this.id, buf);
  }

  pushBatch(samples: readonly LineSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      buf[i * 2] = samples[i]!.t;
      buf[i * 2 + 1] = samples[i]!.y;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Bar (static) — [x, y, x, y, ...] or [y0, y1, ...] stride=1
// ────────────────────────────────────────────────────────────────────────────

export class BarLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  setXY(points: readonly XyPoint[]): void {
    const n = points.length;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      buf[i * 2] = points[i]!.x;
      buf[i * 2 + 1] = points[i]!.y;
    }
    this.sink.pushData(this.id, buf);
  }

  setY(values: readonly number[]): void {
    const buf = new Float32Array(values.length);
    for (let i = 0; i < values.length; i++) buf[i] = values[i]!;
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Candlestick (streaming) — [t, open, high, low, close, ...] stride=5
// ────────────────────────────────────────────────────────────────────────────

export interface CandlestickSample {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export class CandlestickLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  push(s: CandlestickSample): void {
    const buf = new Float32Array(5);
    buf[0] = s.t;
    buf[1] = s.open;
    buf[2] = s.high;
    buf[3] = s.low;
    buf[4] = s.close;
    this.sink.pushData(this.id, buf);
  }

  pushBatch(samples: readonly CandlestickSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      const o = i * 5;
      buf[o] = s.t;
      buf[o + 1] = s.open;
      buf[o + 2] = s.high;
      buf[o + 3] = s.low;
      buf[o + 4] = s.close;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Heatmap (static) — [x, y, value, x, y, value, ...] stride=3
// ────────────────────────────────────────────────────────────────────────────

export interface HeatmapPoint {
  x: number;
  y: number;
  value: number;
}

export class HeatmapLayerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  setGrid(points: readonly HeatmapPoint[]): void {
    const n = points.length;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      buf[i * 3] = p.x;
      buf[i * 3 + 1] = p.y;
      buf[i * 3 + 2] = p.value;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EventMarker — data layout: [t, severity, t, severity, ...] stride=2
// severity: 0=info, 1=warning, 2=error
// ────────────────────────────────────────────────────────────────────────────

export type EventSeverity = 0 | 1 | 2;

export interface MarkerEvent {
  /** Host-relative timestamp in ms. */
  t: number;
  /** 0=info, 1=warning, 2=error. Default 0. */
  severity?: EventSeverity;
}

/**
 * Handle for `kind: "event-marker"` layers. Each `setEvents` call replaces
 * the full marker list (suitable for static annotation overlays).
 * Call `setEvents([])` to clear all markers.
 */
export class EventMarkerHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  setEvents(events: readonly MarkerEvent[]): void {
    const n = events.length;
    const buf = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      buf[i * 2] = events[i]!.t;
      buf[i * 2 + 1] = events[i]!.severity ?? 0;
    }
    this.sink.pushData(this.id, buf);
  }

  clearEvents(): void {
    this.sink.pushData(this.id, new Float32Array(0));
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ScatterColored — data layout: [t, y, colorValue, size, ...] stride=4
// colorValue: 0–1 normalised → LUT color
// size: 0–1 normalised → minSize–maxSize pixels
// ────────────────────────────────────────────────────────────────────────────

export interface ScatterColoredSample {
  /** Host-relative timestamp in ms. */
  t: number;
  y: number;
  /** 0–1 normalised value mapped to colormap. Default 0.5. */
  colorValue?: number;
  /** 0–1 normalised size. Default 0.5. */
  size?: number;
}

export class ScatterColoredHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  push(sample: ScatterColoredSample): void {
    const buf = new Float32Array(4);
    buf[0] = sample.t;
    buf[1] = sample.y;
    buf[2] = sample.colorValue ?? 0.5;
    buf[3] = sample.size ?? 0.5;
    this.sink.pushData(this.id, buf);
  }

  pushBatch(samples: readonly ScatterColoredSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      buf[i * 4] = s.t;
      buf[i * 4 + 1] = s.y;
      buf[i * 4 + 2] = s.colorValue ?? 0.5;
      buf[i * 4 + 3] = s.size ?? 0.5;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Trajectory — data layout: [x, y, t, ...] stride=3
// x/y are world coordinates; t is host-relative ms (time-coloring + fading).
// ────────────────────────────────────────────────────────────────────────────

export interface TrajectorySample {
  /** World-space x coordinate. */
  x: number;
  /** World-space y coordinate. */
  y: number;
  /** Host-relative timestamp in ms. */
  t: number;
}

export class TrajectoryHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  push(sample: TrajectorySample): void {
    const buf = new Float32Array(3);
    buf[0] = sample.x;
    buf[1] = sample.y;
    buf[2] = sample.t;
    this.sink.pushData(this.id, buf);
  }

  pushBatch(samples: readonly TrajectorySample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      buf[i * 3] = s.x;
      buf[i * 3 + 1] = s.y;
      buf[i * 3 + 2] = s.t;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// OccupancyGrid — header + row-major cells:
// [originX, originY, resolution, cols, rows, c0, c1, …]
// cell value: -1 = unknown, 0..100 = occupancy probability
// ────────────────────────────────────────────────────────────────────────────

export interface OccupancyGrid {
  /** World x of the grid's lower-left corner. */
  originX: number;
  /** World y of the grid's lower-left corner. */
  originY: number;
  /** Cell size in world units. */
  resolution: number;
  /** Number of columns. */
  cols: number;
  /** Number of rows. */
  rows: number;
  /** Row-major cell values (`-1` unknown, `0..100` probability). Length `cols*rows`. */
  cells: ArrayLike<number>;
}

/**
 * Handle for `kind: "occupancy-grid"` layers. `setGrid` replaces the whole grid
 * (suitable for a fresh ROS `nav_msgs/OccupancyGrid` each update).
 */
export class OccupancyGridHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  setGrid(grid: OccupancyGrid): void {
    const n = grid.cells.length;
    const buf = new Float32Array(5 + n);
    buf[0] = grid.originX;
    buf[1] = grid.originY;
    buf[2] = grid.resolution;
    buf[3] = grid.cols;
    buf[4] = grid.rows;
    for (let i = 0; i < n; i++) buf[5 + i] = grid.cells[i]!;
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HeatmapStream — data layout: [t, v0, v1, ..., v_{yBins-1}]
// One call per column update.
// ────────────────────────────────────────────────────────────────────────────

export class HeatmapStreamHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  /**
   * Push a single column. `t` is the column timestamp; `values` must have
   * exactly `yBins` elements matching the layer's `yBins` config.
   */
  pushColumn(t: number, values: Float32Array | readonly number[]): void {
    const n = values.length;
    const buf = new Float32Array(n + 1);
    buf[0] = t;
    if (values instanceof Float32Array) {
      buf.set(values, 1);
    } else {
      for (let i = 0; i < n; i++) buf[i + 1] = values[i]!;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ReferenceLine — config-only, no data streaming
// ────────────────────────────────────────────────────────────────────────────

/**
 * Handle for `kind: "reference-line"` layers.
 * Use `setReference` to move the line and band at runtime.
 */
export class ReferenceLineHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  setReference(config: ReferenceLineConfig): void {
    this.sink.configLayer(this.id, config);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PoseArrow — data layout: [t, y, theta, ...] stride=3
// ────────────────────────────────────────────────────────────────────────────

export interface PoseArrowSample {
  /** Host-relative timestamp in ms. */
  t: number;
  /** Y position value (mapped to y-axis). */
  y: number;
  /** Heading angle in radians (0 = right, π/2 = up). */
  theta: number;
}

export class PoseArrowHandle {
  constructor(
    private readonly sink: FluxionDataSink,
    readonly id: string,
  ) {}

  push(sample: PoseArrowSample): void {
    const buf = new Float32Array(3);
    buf[0] = sample.t;
    buf[1] = sample.y;
    buf[2] = sample.theta;
    this.sink.pushData(this.id, buf);
  }

  pushBatch(samples: readonly PoseArrowSample[]): void {
    const n = samples.length;
    if (n === 0) return;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      buf[i * 3] = s.t;
      buf[i * 3 + 1] = s.y;
      buf[i * 3 + 2] = s.theta;
    }
    this.sink.pushData(this.id, buf);
  }

  pushRaw(data: Float32Array): void {
    this.sink.pushData(this.id, data);
  }

  /** Drop the ring buffer and (optionally) rewind `viewport.latestT`. */
  reset(latestT?: number): void {
    this.sink.clearLayer(this.id, { latestT });
  }
}
