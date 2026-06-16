import type { Layer } from "../../../shared/model/layer";
import type { Viewport } from "../../../shared/model/viewport";

export interface HeatmapStreamConfig {
  /**
   * Number of y-bins (rows) in the heatmap grid.
   * Must match the length of each column pushed via the handle. Default 32.
   */
  yBins?: number;
  /**
   * Number of time columns to keep (ring buffer width). Default 256.
   * Columns older than `maxCols` are evicted.
   */
  maxCols?: number;
  /** Y range of the grid: [yMin, yMax]. Default [0, 1]. */
  yRange?: [number, number];
  colormap?: "viridis" | "plasma" | "hot";
  /** Value mapped to the cold end of the colormap. Default: auto (data min). */
  minValue?: number;
  /** Value mapped to the hot end of the colormap. Default: auto (data max). */
  maxValue?: number;
  /** When false, skip draw. Default true. */
  visible?: boolean;
}

/**
 * Streaming heatmap. Accumulates column-by-column updates in a ring buffer.
 *
 * Data layout per `setData` call: Float32Array `[t, v0, v1, ..., v_{yBins-1}]`
 * where `t` is the column timestamp and `v_i` is the value for y-bin `i`.
 * Length must equal `yBins + 1`.
 *
 * Use for occupancy grids, joint temperature maps, frequency spectrograms, etc.
 */
export class HeatmapStreamLayer implements Layer {
  readonly id: string;
  private yBins = 32;
  private maxCols = 256;
  private yMin = 0;
  private yMax = 1;
  private colormap: "viridis" | "plasma" | "hot" = "viridis";
  private lut: Uint8Array = VIRIDIS_LUT;
  private minValue: number | undefined;
  private maxValue: number | undefined;
  private visible = true;

  // Ring buffer of columns: circular array of Float32Array(yBins) + timestamp Float32Array.
  private colData: Float32Array; // flat [col0_v0..v_{yBins-1}, col1_v0..., ...]
  private colTs: Float32Array; // timestamps per column
  private head = 0;
  private count = 0;

  constructor(id: string) {
    this.id = id;
    this.colData = new Float32Array(this.maxCols * this.yBins);
    this.colTs = new Float32Array(this.maxCols);
  }

  private allocBuffers(): void {
    this.colData = new Float32Array(this.maxCols * this.yBins);
    this.colTs = new Float32Array(this.maxCols);
    this.head = 0;
    this.count = 0;
  }

  setConfig(config: unknown): void {
    const c = config as HeatmapStreamConfig;
    let needRealloc = false;
    if (c.yBins !== undefined && c.yBins !== this.yBins) {
      this.yBins = Math.max(1, c.yBins);
      needRealloc = true;
    }
    if (c.maxCols !== undefined && c.maxCols !== this.maxCols) {
      this.maxCols = Math.max(4, c.maxCols);
      needRealloc = true;
    }
    if (needRealloc) this.allocBuffers();
    if (c.yRange !== undefined) {
      this.yMin = c.yRange[0];
      this.yMax = c.yRange[1];
    }
    if (c.minValue !== undefined) this.minValue = c.minValue;
    if (c.maxValue !== undefined) this.maxValue = c.maxValue;
    if (c.visible !== undefined) this.visible = c.visible;
    if (c.colormap !== undefined) {
      this.colormap = c.colormap;
      this.lut =
        c.colormap === "plasma"
          ? PLASMA_LUT
          : c.colormap === "hot"
            ? HOT_LUT
            : VIRIDIS_LUT;
    }
  }

  setData(buffer: ArrayBuffer, length: number, viewport: Viewport): void {
    // Expect [t, v0, v1, ..., v_{yBins-1}] — length = yBins + 1
    if (length < 2) return;
    const arr = new Float32Array(buffer, 0, length);
    const t = arr[0]!;
    const bins = Math.min(this.yBins, length - 1);

    const slot = this.head;
    this.colTs[slot] = t;
    const base = slot * this.yBins;
    for (let i = 0; i < bins; i++) {
      this.colData[base + i] = arr[i + 1]!;
    }
    this.head = (this.head + 1) % this.maxCols;
    if (this.count < this.maxCols) this.count++;

    if (t > viewport.latestT) viewport.latestT = t;
  }

  resize(_viewport: Viewport): void {}

  scan(viewport: Viewport): void {
    if (!this.visible || this.count === 0) return;
    // Report y range for axis-grid auto mode.
    if (viewport.observedYMin > this.yMin) viewport.observedYMin = this.yMin;
    if (viewport.observedYMax < this.yMax) viewport.observedYMax = this.yMax;
  }

  draw(ctx: OffscreenCanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.visible || this.count === 0) return;

    const { xMin, xMax } = viewport.bounds;
    const lut = this.lut;
    const bins = this.yBins;

    // Determine value range for normalisation.
    let vMin = this.minValue;
    let vMax = this.maxValue;
    if (vMin === undefined || vMax === undefined) {
      let autoMin = Number.POSITIVE_INFINITY;
      let autoMax = Number.NEGATIVE_INFINITY;
      const start = this.count < this.maxCols ? 0 : this.head;
      for (let i = 0; i < this.count; i++) {
        const slot = (start + i) % this.maxCols;
        const base = slot * bins;
        for (let b = 0; b < bins; b++) {
          const v = this.colData[base + b]!;
          if (v < autoMin) autoMin = v;
          if (v > autoMax) autoMax = v;
        }
      }
      if (vMin === undefined) vMin = autoMin;
      if (vMax === undefined) vMax = autoMax;
    }
    const range = vMax - vMin || 1;

    // Compute cell pixel dimensions.
    const cellH = viewport.heightPx / bins;
    const start = this.count < this.maxCols ? 0 : this.head;

    // Draw columns oldest→newest, clipped to visible x range.
    for (let i = 0; i < this.count; i++) {
      const slot = (start + i) % this.maxCols;
      const t = this.colTs[slot]!;
      if (t < xMin || t > xMax) continue;
      const px = viewport.xToPx(t);

      // Determine cell width from adjacent column spacing.
      let cellW = 4;
      if (i + 1 < this.count) {
        const nextSlot = (start + i + 1) % this.maxCols;
        const nextT = this.colTs[nextSlot]!;
        cellW = Math.max(1, Math.abs(viewport.xToPx(nextT) - px));
      }

      const base = slot * bins;
      for (let b = 0; b < bins; b++) {
        // y-bin 0 = bottom (yMin), b = bins-1 = top (yMax).
        const yVal = this.yMin + (b / bins) * (this.yMax - this.yMin);
        const py = viewport.yToPx(yVal + (this.yMax - this.yMin) / bins);
        const norm = Math.max(0, Math.min(1, (this.colData[base + b]! - vMin) / range));
        const li = Math.floor(norm * 255) * 3;
        ctx.fillStyle = `rgb(${lut[li]},${lut[li + 1]},${lut[li + 2]})`;
        ctx.fillRect(px - cellW / 2, py, cellW, Math.ceil(cellH) + 1);
      }
    }
  }

  dispose(): void {
    this.colData = new Float32Array(0);
    this.colTs = new Float32Array(0);
    this.count = 0;
  }
}

// ── Colormaps (256-entry RGB LUTs) ───────────────────────────────────────────

function buildLut(stops: [number, number, number, number][]): Uint8Array {
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < stops.length - 1 && stops[j + 1]![0]! < t) j++;
    const [t0, r0, g0, b0] = stops[j]!;
    const [t1, r1, g1, b1] = stops[Math.min(j + 1, stops.length - 1)]!;
    /* v8 ignore start -- t0===t1 unreachable: stop times strictly increasing, j capped at length-2 */
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    /* v8 ignore stop */
    out[i * 3] = Math.round(r0 + (r1 - r0) * f);
    out[i * 3 + 1] = Math.round(g0 + (g1 - g0) * f);
    out[i * 3 + 2] = Math.round(b0 + (b1 - b0) * f);
  }
  return out;
}

const VIRIDIS_LUT = buildLut([
  [0.0, 68, 1, 84],
  [0.25, 59, 82, 139],
  [0.5, 33, 145, 140],
  [0.75, 94, 201, 98],
  [1.0, 253, 231, 37],
]);
const PLASMA_LUT = buildLut([
  [0.0, 13, 8, 135],
  [0.25, 126, 3, 168],
  [0.5, 204, 71, 120],
  [0.75, 248, 149, 64],
  [1.0, 240, 249, 33],
]);
const HOT_LUT = buildLut([
  [0.0, 0, 0, 0],
  [0.333, 255, 0, 0],
  [0.667, 255, 255, 0],
  [1.0, 255, 255, 255],
]);
