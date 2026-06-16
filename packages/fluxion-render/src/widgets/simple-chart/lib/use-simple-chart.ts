import { useCallback, useRef, useState } from "react";
import type { HoverDataCache } from "../../../features/crosshair";
import type { FluxionHost } from "../../../features/host";
import { useTimeOrigin } from "../../../features/synced-time";
import type { axisGridLayer, lineLayer } from "../../fluxion-canvas/lib/layer-specs";
import type { FluxionLayerSpec } from "../../fluxion-canvas/lib/use-fluxion-canvas";
import { useFluxionStream } from "../../fluxion-canvas/lib/use-fluxion-stream";
import { useMiniChart } from "../../mini-chart/lib/use-mini-chart";

export interface UseSimpleChartOptions {
  /**
   * Per-tick sampler. Receives the host-relative `tMs` and returns either a
   * y value (plotted at `tMs`) or an explicit `{ t, y }` sample.
   */
  sample: (tMs: number) => number | { t: number; y: number };
  /** Sample rate (Hz). Drives both the pump interval and the ring capacity. */
  hz: number;
  /** Visible time window in ms → `axisGridLayer.timeWindowMs`. */
  windowMs: number;
  /** Line colour. Default `"#4fc3f7"`. */
  color?: string;
  /** Stroke width. Default `1.25` (mini-chart default). */
  lineWidth?: number;
  /** Wall-clock anchor. Defaults to a stable `useTimeOrigin()`. */
  timeOrigin?: number;
  /** Line layer id. Default `"line"`. */
  layerId?: string;
  /** Axis layer id. Default `"axis"`. */
  axisLayerId?: string;
  /** Override/extend the axis-grid config (merged after the managed fields). */
  axis?: Parameters<typeof axisGridLayer>[1];
  /** Override/extend the line config (merged after color/lineWidth/capacity). */
  line?: Parameters<typeof lineLayer>[1];
  /**
   * Optional hover cache. When provided, each pushed sample is also written to
   * the cache (under `layerId`) so a crosshair can read it — no manual
   * `cache.push` in the sampler. Pair with `useHoverDataCache`.
   */
  cache?: HoverDataCache;
}

export interface UseSimpleChartResult {
  /** Pass straight to `<FluxionCanvas layers={...} />`. */
  layers: FluxionLayerSpec[];
  /** Live host, `null` until the canvas mounts. */
  host: FluxionHost | null;
  /** Wire to `<FluxionCanvas onReady={setHost} />`. */
  setHost: (host: FluxionHost) => void;
  /** Samples pushed per second (from the stream pump). */
  rate: number;
}

/**
 * The "just show me live data" one-call helper. Bundles the time origin, the
 * `axis-grid + line` layer pair (via {@link useMiniChart}, so capacity is
 * auto-sized), and the {@link useFluxionStream} pump behind a single sampler.
 *
 * It does NOT own the canvas — return `layers` + `setHost` and render a
 * `<FluxionCanvas>` yourself, so the chart composes with crosshair/legend
 * overlays and the existing canvas lifecycle.
 *
 * @example
 * function Live() {
 *   const { layers, setHost } = useSimpleChart({
 *     hz: 60, windowMs: 5000, color: "#4fc3f7",
 *     sample: (t) => Math.sin(t / 500),
 *   });
 *   return <FluxionCanvas layers={layers} onReady={setHost} />;
 * }
 */
export function useSimpleChart(opts: UseSimpleChartOptions): UseSimpleChartResult {
  const {
    sample,
    hz,
    windowMs,
    color,
    lineWidth,
    layerId = "line",
    axisLayerId = "axis",
    axis,
    line,
    cache,
  } = opts;

  const fallbackOrigin = useTimeOrigin();
  const timeOrigin = opts.timeOrigin ?? fallbackOrigin;

  const { layers } = useMiniChart({
    color,
    lineWidth,
    timeWindowMs: windowMs,
    timeOrigin,
    layerId,
    axisLayerId,
    sampleHz: hz,
    axis,
    line,
  });

  const [host, setHost] = useState<FluxionHost | null>(null);

  // Keep the sampler + cache in refs so the stream's setup/tick identities stay
  // stable (the pump captures them once; we always read the latest).
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  const setup = useCallback((h: FluxionHost) => h.line(layerId), [layerId]);
  const tick = useCallback(
    (tMs: number, handle: ReturnType<FluxionHost["line"]>) => {
      const s = sampleRef.current(tMs);
      const t = typeof s === "number" ? tMs : s.t;
      const y = typeof s === "number" ? s : s.y;
      handle.push({ t, y });
      cacheRef.current?.push(layerId, t, y);
      return 1;
    },
    [layerId],
  );

  const { rate } = useFluxionStream({
    host,
    intervalMs: 1000 / hz,
    setup,
    tick,
  });

  return { layers, host, setHost, rate };
}
