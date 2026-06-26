import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { AreaChartConfig } from "../../../entities/area-chart-layer";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { BarChartConfig } from "../../../entities/bar-chart-layer";
import type { BoxPlotConfig } from "../../../entities/box-plot-layer";
import type { CandlestickConfig } from "../../../entities/candlestick-layer";
import type { EventMarkerConfig } from "../../../entities/event-marker-layer";
import type { HeatmapConfig } from "../../../entities/heatmap-layer";
import type { HeatmapStreamConfig } from "../../../entities/heatmap-stream-layer";
import type { HistogramConfig } from "../../../entities/histogram-layer";
import type { LidarScatterConfig } from "../../../entities/lidar-scatter-layer";
import type { LineChartConfig } from "../../../entities/line-chart-layer";
import type { LineChartStaticConfig } from "../../../entities/line-chart-static-layer";
import type { OccupancyGridConfig } from "../../../entities/occupancy-grid-layer";
import type { PolarConfig } from "../../../entities/polar-layer";
import type { PoseArrowConfig } from "../../../entities/pose-arrow-layer";
import type { ReferenceLineConfig } from "../../../entities/reference-line-layer";
import type { ScatterChartConfig } from "../../../entities/scatter-chart-layer";
import type { ScatterColoredConfig } from "../../../entities/scatter-colored-layer";
import type { StackedAreaConfig } from "../../../entities/stacked-area-layer";
import type { StepChartConfig } from "../../../entities/step-chart-layer";
import type { TrajectoryConfig } from "../../../entities/trajectory-layer";
import { FluxionHost, type FluxionHostOptions } from "../../../features/host";
import { enqueueMount } from "./mount-scheduler";
import { type ResizeInfo, useResizeObserver } from "./use-resize-observer";

/**
 * Declarative layer spec used by `useFluxionCanvas` and `<FluxionCanvas/>`.
 *
 * Discriminated union: `kind` narrows `config` to the matching layer-specific
 * type, so wrong fields are caught at compile time. Prefer the layer factory
 * helpers (`lineLayer`, `axisGridLayer`, etc.) for ergonomic construction —
 * they encode the kind so callers don't repeat themselves.
 */
export type FluxionLayerSpec =
  | { id: string; kind: "line"; config?: LineChartConfig }
  | { id: string; kind: "line-static"; config?: LineChartStaticConfig }
  | { id: string; kind: "lidar"; config?: LidarScatterConfig }
  | { id: string; kind: "axis-grid"; config?: AxisGridConfig }
  | { id: string; kind: "scatter"; config?: ScatterChartConfig }
  | { id: string; kind: "area"; config?: AreaChartConfig }
  | { id: string; kind: "step"; config?: StepChartConfig }
  | { id: string; kind: "bar"; config?: BarChartConfig }
  | { id: string; kind: "candlestick"; config?: CandlestickConfig }
  | { id: string; kind: "heatmap"; config?: HeatmapConfig }
  | { id: string; kind: "event-marker"; config?: EventMarkerConfig }
  | { id: string; kind: "scatter-colored"; config?: ScatterColoredConfig }
  | { id: string; kind: "heatmap-stream"; config?: HeatmapStreamConfig }
  | { id: string; kind: "reference-line"; config?: ReferenceLineConfig }
  | { id: string; kind: "pose-arrow"; config?: PoseArrowConfig }
  | { id: string; kind: "trajectory"; config?: TrajectoryConfig }
  | { id: string; kind: "occupancy-grid"; config?: OccupancyGridConfig }
  | { id: string; kind: "histogram"; config?: HistogramConfig }
  | { id: string; kind: "stacked-area"; config?: StackedAreaConfig }
  | { id: string; kind: "box-plot"; config?: BoxPlotConfig }
  | { id: string; kind: "polar"; config?: PolarConfig };

export interface UseFluxionCanvasOptions {
  layers: FluxionLayerSpec[];
  hostOptions?: FluxionHostOptions;
  onReady?: (host: FluxionHost) => void;
  /**
   * Container div for the x-axis canvas. The effect creates a fresh `<canvas>`
   * inside this div on every mount — StrictMode-safe (no reuse of a transferred element).
   */
  xAxisContainerRef?: RefObject<HTMLDivElement | null>;
  /**
   * Container div for the y-axis canvas. Same lifetime contract as xAxisContainerRef.
   */
  yAxisContainerRef?: RefObject<HTMLDivElement | null>;
  /**
   * Defer the expensive host creation (OffscreenCanvas transfer + worker
   * `POOL_INIT` + first render) through a shared frame-throttled queue so a
   * burst of simultaneous mounts (an accordion expanding, a grid appearing)
   * spreads across frames instead of spiking one. The placeholder `<canvas>`
   * is still attached immediately; only the host spins up on a later frame, so
   * `host` / `onReady` arrive deferred. Tune the rate with
   * {@link configureMountScheduler}. Default `false` (synchronous).
   */
  staggerMount?: boolean;
}

export interface UseFluxionCanvasResult {
  /**
   * Attach to a `<div>`. The hook appends a `<canvas>` child imperatively —
   * do NOT render a canvas yourself inside this container.
   */
  containerRef: RefObject<HTMLDivElement>;
  /**
   * Live host handle. `null` until the effect completes on the first mount.
   * Updates to a new instance if the component remounts.
   */
  host: FluxionHost | null;
}

function makeAxisCanvas(container: HTMLDivElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.minWidth = "0";
  canvas.style.minHeight = "0";
  container.appendChild(canvas);
  return canvas;
}

/**
 * Low-level React hook that owns a FluxionRender worker + OffscreenCanvas.
 *
 * Consumers attach `containerRef` to any `<div>` and the hook:
 *  1. Creates a fresh `<canvas>` inside the div on mount (one-shot
 *     `transferControlToOffscreen` is safe because each effect invocation
 *     allocates its own element — StrictMode double-invoke compatible)
 *  2. Spins up a `FluxionHost` + worker and registers the supplied layers
 *  3. Observes container size / DPR and forwards resize messages
 *  4. Terminates the worker + removes the canvas on unmount
 *
 * The `layers` array is reconciled when its reference changes (memoize it and
 * list your config inputs as deps): added layers are created, removed layers
 * are dropped, a changed `kind` swaps the layer, and changed configs are
 * re-sent via `configLayer` — no `key` remount needed for structural changes.
 * Re-ORDERING existing layers is not reconciled (draw order follows insertion);
 * `hostOptions` and `onReady` remain mount-only. Swap the `key` for a full
 * re-initialization (e.g. to reorder or change the worker pool).
 */
export function useFluxionCanvas(
  options: UseFluxionCanvasOptions,
): UseFluxionCanvasResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<FluxionHost | null>(null);
  const [host, setHost] = useState<FluxionHost | null>(null);
  // Incremented when a disposed-pool early-return fires, so the effect re-runs
  // once the parent re-renders with a fresh pool.
  const [mountKey, setMountKey] = useState(0);

  // Stash the latest options in a ref so the mount effect can stay with
  // an empty dep array without going stale between StrictMode invocations.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Serialized configs already applied to the worker, keyed by layer id.
  // Seeded at mount (addLayer carries the initial config) so the reconcile
  // effect below doesn't re-send what the worker already has.
  const lastAppliedRef = useRef<Map<string, string>>(new Map());
  // Layer kind currently present in the worker, keyed by id. Drives the
  // structural reconcile (add / remove / kind-change) below.
  const lastKindsRef = useRef<Map<string, FluxionLayerSpec["kind"]>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    /* v8 ignore start -- containerRef is always attached once mounted; null-ref guard */
    if (!container) return;
    /* v8 ignore stop */

    // StrictMode: parent cleanup disposes the pool and schedules a new one via setPool,
    // but children effects re-run synchronously before that re-render propagates the new
    // pool. Bump mountKey so this effect re-runs after the parent re-renders with pool B.
    const current = optionsRef.current;
    if (current.hostOptions?.pool?.isDisposed) {
      setMountKey((k) => k + 1);
      return;
    }

    // Main chart canvas — created fresh each mount.
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.minWidth = "0";
    canvas.style.minHeight = "0";
    container.appendChild(canvas);

    // Axis canvases — also created fresh each mount so transferControlToOffscreen
    // is always called on a brand-new element (StrictMode double-invoke safe).
    const xAxisContainer = current.xAxisContainerRef?.current ?? null;
    const yAxisContainer = current.yAxisContainerRef?.current ?? null;
    const xAxisCanvas = xAxisContainer ? makeAxisCanvas(xAxisContainer) : undefined;
    const yAxisCanvas = yAxisContainer ? makeAxisCanvas(yAxisContainer) : undefined;

    // The expensive part — OffscreenCanvas transfer + worker POOL_INIT + first
    // render — lives in this closure so `staggerMount` can defer it through the
    // shared frame queue, spreading a burst of simultaneous mounts over frames.
    let instance: FluxionHost | null = null;
    const createHost = () => {
      instance = new FluxionHost(canvas, {
        ...current.hostOptions,
        xAxisElement: xAxisCanvas,
        yAxisElement: yAxisCanvas,
      });
      hostRef.current = instance;
      for (const l of current.layers) instance.addLayer(l.id, l.kind, l.config);
      // Baseline the reconcile map to what addLayer just applied (re-seeded on
      // every remount so a fresh host never inherits a stale baseline).
      lastAppliedRef.current = new Map(
        current.layers.map((l) => [l.id, JSON.stringify(l.config)]),
      );
      lastKindsRef.current = new Map(current.layers.map((l) => [l.id, l.kind]));
      setHost(instance);
      current.onReady?.(instance);
    };

    const cancelMount = current.staggerMount ? enqueueMount(createHost) : null;
    if (!cancelMount) createHost();

    return () => {
      // If the host hasn't been created yet (unmounted before its turn in the
      // frame queue), just drop the queued task — there's no host/worker to tear
      // down, and nothing leaks. Otherwise dispose the live host.
      cancelMount?.();
      if (instance) instance.dispose();
      hostRef.current = null;
      setHost(null);
      if (canvas.parentNode === container) container.removeChild(canvas);
      if (xAxisCanvas && xAxisCanvas.parentNode === xAxisContainer) {
        xAxisContainer!.removeChild(xAxisCanvas);
      }
      if (yAxisCanvas && yAxisCanvas.parentNode === yAxisContainer) {
        yAxisContainer!.removeChild(yAxisCanvas);
      }
    };
  }, [mountKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconcile the `layers` array against what the worker holds whenever the
  // reference changes. Memoize `layers` in the consumer and list config inputs
  // as deps. Handles three structural cases plus config diffing:
  //   • added layer (new id)            → addLayer
  //   • removed layer (id gone)         → removeLayer
  //   • changed kind (same id, new kind)→ removeLayer + addLayer
  //   • changed config (same id+kind)   → configLayer
  // Re-ORDERING existing layers is not reconciled (draw order is insertion
  // order); remount via `key` if you must reorder.
  const layers = options.layers;
  useEffect(() => {
    if (!host) return;
    const applied = lastAppliedRef.current;
    const kinds = lastKindsRef.current;
    const nextIds = new Set(layers.map((l) => l.id));

    // 1. Remove layers that are no longer present.
    for (const id of [...kinds.keys()]) {
      if (!nextIds.has(id)) {
        host.removeLayer(id);
        kinds.delete(id);
        applied.delete(id);
      }
    }

    // 2. Add / replace / reconfigure.
    for (const spec of layers) {
      const prevKind = kinds.get(spec.id);
      const serialized = JSON.stringify(spec.config);
      if (prevKind === undefined) {
        // New layer.
        host.addLayer(spec.id, spec.kind, spec.config);
        kinds.set(spec.id, spec.kind);
        applied.set(spec.id, serialized);
      } else if (prevKind !== spec.kind) {
        // Kind changed → drop and re-add so the worker swaps the layer class.
        host.removeLayer(spec.id);
        host.addLayer(spec.id, spec.kind, spec.config);
        kinds.set(spec.id, spec.kind);
        applied.set(spec.id, serialized);
      } else if (spec.config !== undefined && applied.get(spec.id) !== serialized) {
        // Same kind, changed config.
        applied.set(spec.id, serialized);
        host.configLayer(spec.id, spec.config);
      }
    }
  }, [host, layers]);

  const handleResize = useCallback((info: ResizeInfo) => {
    const instance = hostRef.current;
    /* v8 ignore start -- host is set before RO fires; jsdom rects are 0×0 so the
       non-zero resize path never runs in tests (defensive guards + real resize). */
    if (!instance) return;
    if (info.width === 0 || info.height === 0) return;
    instance.resize(info.width, info.height, info.dpr);
    /* v8 ignore stop */
  }, []);

  useResizeObserver(containerRef, handleResize);

  return { containerRef, host };
}
