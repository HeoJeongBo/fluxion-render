export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export class Viewport {
  widthPx = 0;
  heightPx = 0;
  dpr = 1;

  bounds: Bounds = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };

  /**
   * Most recent data timestamp (ms, host-relative) seen across all streaming
   * layers. Streaming `LineChartLayer` updates this on setData; `AxisGridLayer`
   * in time mode uses it to compute a sliding window.
   */
  latestT = 0;

  /**
   * Per-frame aggregate of observed y values across all data layers that
   * currently overlap the visible time window. `AxisGridLayer` in
   * `yMode: "auto"` reads these in draw to compute bounds.yMin/yMax.
   *
   * Initialised to +/-Infinity by `beginScan()` at the top of every frame,
   * then layers merge their visible-window min/max in via `scan()`.
   */
  observedYMin = Number.POSITIVE_INFINITY;
  observedYMax = Number.NEGATIVE_INFINITY;

  setSize(width: number, height: number, dpr: number) {
    this.widthPx = width;
    this.heightPx = height;
    this.dpr = dpr;
  }

  setBounds(b: Bounds) {
    this.bounds = b;
  }

  /** Called by Engine at the start of each render frame before scan pass. */
  beginScan(): void {
    this.observedYMin = Number.POSITIVE_INFINITY;
    this.observedYMax = Number.NEGATIVE_INFINITY;
  }

  xToPx(x: number): number {
    const { xMin, xMax } = this.bounds;
    return ((x - xMin) / (xMax - xMin)) * this.widthPx;
  }

  yToPx(y: number): number {
    const { yMin, yMax } = this.bounds;
    return this.heightPx - ((y - yMin) / (yMax - yMin)) * this.heightPx;
  }
}
