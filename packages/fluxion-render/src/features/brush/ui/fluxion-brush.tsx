import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { BrushSelection, UseFluxionBrushResult } from "../model/use-fluxion-brush";

export interface FluxionBrushProps {
  /** Ref returned by `useFluxionBrush`. */
  brushRef: UseFluxionBrushResult["brushRef"];
  /** Current selection returned by `useFluxionBrush`. */
  selection: BrushSelection | null;
  /** Width of the overlay (should match the canvas width). */
  width: number;
  /** Height of the overlay (should match the canvas height). */
  height: number;
  /** Fill color of the selected region. Default: semi-transparent blue. */
  selectionColor?: string;
  /** Border color of the selected region. Default: cornflowerblue. */
  borderColor?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * SVG overlay that renders drag-to-select brush highlighting.
 *
 * Place this as an absolutely-positioned element over `FluxionCanvas`.
 * Wire up with `useFluxionBrush` — pass `brushRef` and `selection` from that hook.
 *
 * The x tick fractions used for time conversion are injected via the host in
 * `useFluxionBrush`; this component only handles the visual drag interaction.
 */
export function FluxionBrush({
  brushRef,
  selection,
  width,
  height,
  selectionColor = "rgba(100, 149, 237, 0.2)",
  borderColor = "#6495ed",
  style,
  className,
}: FluxionBrushProps) {
  // Track live drag visuals (not tied to committed selection).
  const [dragRect, setDragRect] = useState<{ x: number; w: number } | null>(null);
  const dragStartRef = useRef<number | null>(null);

  useEffect(() => {
    const svg = brushRef.current;
    if (!svg) return;

    const onMouseDown = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      dragStartRef.current = e.clientX - rect.left;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (dragStartRef.current == null) return;
      const rect = svg.getBoundingClientRect();
      const cur = e.clientX - rect.left;
      const x = Math.min(dragStartRef.current, cur);
      const w = Math.abs(cur - dragStartRef.current);
      setDragRect({ x, w });
    };

    const onMouseUp = () => {
      dragStartRef.current = null;
      setDragRect(null);
    };

    svg.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      svg.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [brushRef]);

  // Convert committed selection (in time) back to pixel x for rendering.
  // Since we don't have a direct time→px converter here, we rely on the dragRect
  // for live visual feedback. Committed selection is shown via a stored pixel rect
  // that was computed at mouseup time.
  const committedRect = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    if (!selection) {
      committedRect.current = null;
    }
    // The committed rect is already set via dragRect snapshotted at mouseup.
    // We snapshot it below.
  }, [selection]);

  // Snapshot dragRect as committedRect on mouseup (when selection becomes set).
  const prevDragRect = useRef<{ x: number; w: number } | null>(null);
  if (dragRect !== null) {
    prevDragRect.current = dragRect;
  }

  const displayRect = dragRect ?? (selection ? prevDragRect.current : null);

  return (
    <svg
      ref={brushRef}
      width={width}
      height={height}
      style={{ cursor: "crosshair", userSelect: "none", ...style }}
      className={className}
    >
      {displayRect && displayRect.w > 2 && (
        <>
          <rect
            x={displayRect.x}
            y={0}
            width={displayRect.w}
            height={height}
            fill={selectionColor}
          />
          <line
            x1={displayRect.x}
            y1={0}
            x2={displayRect.x}
            y2={height}
            stroke={borderColor}
            strokeWidth={1}
          />
          <line
            x1={displayRect.x + displayRect.w}
            y1={0}
            x2={displayRect.x + displayRect.w}
            y2={height}
            stroke={borderColor}
            strokeWidth={1}
          />
        </>
      )}
    </svg>
  );
}
