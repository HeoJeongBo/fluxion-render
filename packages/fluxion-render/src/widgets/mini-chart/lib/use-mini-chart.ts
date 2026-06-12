import { useMemo } from "react";
import { axisGridLayer, lineLayer } from "../../fluxion-canvas/lib/layer-specs";
import type { FluxionLayerSpec } from "../../fluxion-canvas/lib/use-fluxion-canvas";

export interface UseMiniChartOptions {
  /** Line colour. Default `"#4fc3f7"`. */
  color?: string;
  /** Stroke width. Default `1.25`. */
  lineWidth?: number;
  /** Visible time window in ms. Drives `axisGridLayer.timeWindowMs`. */
  timeWindowMs: number;
  /**
   * Wall-clock anchor for the chart's host-relative `t`. Forwarded to
   * `axisGridLayer({ timeOrigin })` so the x-axis labels reconstruct
   * wall-clock times. Matches the consumer's `Date.now() - timeOrigin`
   * convention for samples pushed via `host.line(id).push({ t, y })`.
   */
  timeOrigin: number;
  /** Layer id assigned to the line. Default `"line"`. */
  layerId?: string;
  /** Layer id assigned to the axis. Default `"axis"`. */
  axisLayerId?: string;
  /**
   * Ring-buffer capacity for the line layer. Defaults to
   * `ceil(timeWindowMs / 1000 * sampleHz * 1.5)` so a 5s @ 60Hz chart
   * rounds to 450 samples — enough headroom for the trailing window plus
   * one batch overshoot.
   */
  capacity?: number;
  /** Expected sample rate (Hz). Used only when `capacity` isn't set. Default `60`. */
  sampleHz?: number;
  /**
   * Override the axis-grid config. Use to enable axis labels, custom
   * grid colour, etc. The required `xMode`, `timeWindowMs`, and
   * `timeOrigin` are merged in automatically.
   */
  axis?: Parameters<typeof axisGridLayer>[1];
  /**
   * Override the line config beyond `color` / `lineWidth` / `capacity`
   * (`retentionMs`, `maxHz`, `visible`).
   */
  line?: Parameters<typeof lineLayer>[1];
}

export interface UseMiniChartResult {
  /** Pass straight to `<FluxionCanvas layers={...} />`. */
  layers: FluxionLayerSpec[];
}

const DEFAULT_COLOR = "#4fc3f7";
const DEFAULT_LINE_WIDTH = 1.25;
const DEFAULT_SAMPLE_HZ = 60;

/**
 * Stamps out the `axis-grid + line` layer pair every mini-chart in the
 * monorepo's demos kept repeating. Single call returns a memoised
 * `layers` array ready to hand to `<FluxionCanvas>`.
 *
 * @example
 * function MyChart({ color }: { color: string }) {
 *   const [host, setHost] = useState<FluxionHost | null>(null);
 *   const { layers } = useMiniChart({ color, timeWindowMs: 5000, timeOrigin });
 *   return <FluxionCanvas layers={layers} onReady={setHost} />;
 * }
 */
export function useMiniChart(opts: UseMiniChartOptions): UseMiniChartResult {
  const {
    color = DEFAULT_COLOR,
    lineWidth = DEFAULT_LINE_WIDTH,
    timeWindowMs,
    timeOrigin,
    layerId = "line",
    axisLayerId = "axis",
    capacity,
    sampleHz = DEFAULT_SAMPLE_HZ,
    axis,
    line,
  } = opts;

  const layers = useMemo<FluxionLayerSpec[]>(() => {
    const ringCapacity = capacity ?? Math.ceil((timeWindowMs / 1000) * sampleHz * 1.5);
    return [
      axisGridLayer(axisLayerId, {
        xMode: "time",
        timeWindowMs,
        timeOrigin,
        yMode: "auto",
        ...axis,
      }),
      lineLayer(layerId, {
        color,
        lineWidth,
        capacity: ringCapacity,
        ...line,
      }),
    ];
  }, [
    color,
    lineWidth,
    timeWindowMs,
    timeOrigin,
    layerId,
    axisLayerId,
    capacity,
    sampleHz,
    axis,
    line,
  ]);

  return { layers };
}
