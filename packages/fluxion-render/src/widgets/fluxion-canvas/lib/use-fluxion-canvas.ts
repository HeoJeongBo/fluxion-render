import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { FluxionHost, type FluxionHostOptions } from "../../../features/host";
import type { LayerKind } from "../../../shared/protocol";
import { type ResizeInfo, useResizeObserver } from "./use-resize-observer";

export interface FluxionLayerSpec {
  id: string;
  kind: LayerKind;
  config?: unknown;
}

export interface UseFluxionCanvasOptions {
  layers: FluxionLayerSpec[];
  hostOptions?: FluxionHostOptions;
  onReady?: (host: FluxionHost) => void;
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

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const current = optionsRef.current;
    const instance = new FluxionHost(canvas, current.hostOptions);
    hostRef.current = instance;
    for (const l of current.layers) instance.addLayer(l.id, l.kind, l.config);
    setHost(instance);
    current.onReady?.(instance);

    return () => {
      instance.dispose();
      hostRef.current = null;
      setHost(null);
      if (canvas.parentNode === container) container.removeChild(canvas);
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
