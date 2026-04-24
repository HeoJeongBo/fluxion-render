import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { AxisGridConfig } from "../../../entities/axis-grid-layer";
import type { LidarScatterConfig } from "../../../entities/lidar-scatter-layer";
import type { LineChartConfig } from "../../../entities/line-chart-layer";
import type { LineChartStaticConfig } from "../../../entities/line-chart-static-layer";
import { FluxionHost, type FluxionHostOptions } from "../../../features/host";
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
  | { id: string; kind: "axis-grid"; config?: AxisGridConfig };

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
 * `layers`, `hostOptions`, and `onReady` are captured on mount only — future
 * prop changes are intentionally ignored (this matches the v0.1 widget and
 * keeps the hook predictable). Swap the `key` on the host element if you
 * need a full re-initialization.
 */
export function useFluxionCanvas(
  options: UseFluxionCanvasOptions,
): UseFluxionCanvasResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<FluxionHost | null>(null);
  const [host, setHost] = useState<FluxionHost | null>(null);

  // Stash the latest options in a ref so the mount effect can stay with
  // an empty dep array without going stale between StrictMode invocations.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
    const current = optionsRef.current;
    const xAxisContainer = current.xAxisContainerRef?.current ?? null;
    const yAxisContainer = current.yAxisContainerRef?.current ?? null;
    const xAxisCanvas = xAxisContainer ? makeAxisCanvas(xAxisContainer) : undefined;
    const yAxisCanvas = yAxisContainer ? makeAxisCanvas(yAxisContainer) : undefined;

    const instance = new FluxionHost(canvas, {
      ...current.hostOptions,
      xAxisElement: xAxisCanvas,
      yAxisElement: yAxisCanvas,
    });
    hostRef.current = instance;
    for (const l of current.layers) instance.addLayer(l.id, l.kind, l.config);
    setHost(instance);
    current.onReady?.(instance);

    return () => {
      instance.dispose();
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
  }, []);

  const handleResize = useCallback((info: ResizeInfo) => {
    const instance = hostRef.current;
    if (!instance) return;
    if (info.width === 0 || info.height === 0) return;
    instance.resize(info.width, info.height, info.dpr);
  }, []);

  useResizeObserver(containerRef, handleResize);

  return { containerRef, host };
}
