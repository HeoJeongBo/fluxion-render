import type { CSSProperties, RefObject } from "react";
import type { CrosshairState } from "../model/use-fluxion-crosshair";
import { FluxionCrosshair, type FluxionCrosshairProps } from "./fluxion-crosshair";

export interface FluxionCrosshairOverlayProps
  extends Omit<FluxionCrosshairProps, "state" | "style" | "className"> {
  /** `chartRef` returned by `useFluxionCrosshair` / `…FromLayers`. */
  chartRef: RefObject<HTMLDivElement>;
  /** `state` returned by the same hook. */
  state: CrosshairState;
  /** Inset from the parent in CSS px, reserving room for external axes. */
  inset?: { top?: number; left?: number; right?: number; bottom?: number };
  /** Class for the pointer-capture div. */
  captureClassName?: string;
  /** Class for the crosshair render layer. */
  className?: string;
  /** Extra style merged onto both layers. */
  style?: CSSProperties;
}

/**
 * One-call crosshair overlay: the pointer-capture `<div ref={chartRef}>` plus the
 * `<FluxionCrosshair>` render layer, both absolutely positioned with a shared
 * inset. Replaces the ~15-line positioning boilerplate every crosshair demo
 * repeats. Drop it as a sibling of `<FluxionCanvas>` inside a
 * `position: relative` container:
 *
 * ```tsx
 * const cache = useHoverDataCache({ layers });
 * const { chartRef, state } = useFluxionCrosshairFromLayers({ host, cache: cache.cache, layers });
 * <div style={{ position: "relative" }}>
 *   <FluxionCanvas externalAxes layers={layers} onReady={setHost} />
 *   <FluxionCrosshairOverlay chartRef={chartRef} state={state}
 *     inset={{ left: 56, bottom: 28 }} />
 * </div>
 * ```
 */
export function FluxionCrosshairOverlay({
  chartRef,
  state,
  inset,
  captureClassName,
  className,
  style,
  ...crosshairProps
}: FluxionCrosshairOverlayProps) {
  const box: CSSProperties = {
    position: "absolute",
    top: inset?.top ?? 0,
    left: inset?.left ?? 0,
    right: inset?.right ?? 0,
    bottom: inset?.bottom ?? 0,
    ...style,
  };

  return (
    <>
      <div
        ref={chartRef}
        className={captureClassName}
        style={{ ...box, cursor: state.position ? "crosshair" : "default" }}
      />
      <FluxionCrosshair
        {...crosshairProps}
        state={state}
        className={className}
        style={box}
      />
    </>
  );
}
