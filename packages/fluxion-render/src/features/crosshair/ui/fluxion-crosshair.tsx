import type { CSSProperties } from "react";
import type { CrosshairState } from "../model/use-fluxion-crosshair";

export interface FluxionCrosshairProps {
  state: CrosshairState;
  lineColor?: string;
  lineWidth?: number;
  tooltipBg?: string;
  tooltipColor?: string;
  tooltipFontSize?: number;
  style?: CSSProperties;
  className?: string;
}

const TOOLTIP_WIDTH_EST = 180;
const TOOLTIP_HEIGHT_EST = 80;
const FLIP_MARGIN = 16;

export function FluxionCrosshair({
  state,
  lineColor = "rgba(255,255,255,0.45)",
  lineWidth = 1,
  tooltipBg = "rgba(15,18,28,0.92)",
  tooltipColor = "#e2e8f0",
  tooltipFontSize = 11,
  style,
  className,
}: FluxionCrosshairProps) {
  const { position, points } = state;

  return (
    <div
      className={className}
      style={{
        pointerEvents: "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {position && (
        <>
          {/* SVG crosshair lines */}
          <svg
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
          >
            {/* Vertical line */}
            <line
              x1={position.pxX}
              y1={0}
              x2={position.pxX}
              y2="100%"
              stroke={lineColor}
              strokeWidth={lineWidth}
              strokeDasharray="4 3"
            />
            {/* Horizontal line */}
            <line
              x1={0}
              y1={position.pxY}
              x2="100%"
              y2={position.pxY}
              stroke={lineColor}
              strokeWidth={lineWidth}
              strokeDasharray="4 3"
            />
            {/* Dot on each series */}
            {points.map((pt) => (
              <circle
                key={pt.layerId}
                cx={position.pxX}
                cy={position.pxY}
                r={4}
                fill={pt.color}
                stroke="rgba(0,0,0,0.6)"
                strokeWidth={1}
              />
            ))}
          </svg>

          {/* Tooltip */}
          <Tooltip
            pxX={position.pxX}
            pxY={position.pxY}
            points={points}
            bg={tooltipBg}
            color={tooltipColor}
            fontSize={tooltipFontSize}
          />
        </>
      )}
    </div>
  );
}

interface TooltipProps {
  pxX: number;
  pxY: number;
  points: CrosshairState["points"];
  bg: string;
  color: string;
  fontSize: number;
}

function Tooltip({ pxX, pxY, points, bg, color, fontSize }: TooltipProps) {
  if (points.length === 0) return null;

  // Use first point's xLabel for the header (all points share the same x cursor)
  const xLabel = points[0]!.xLabel;

  // Flip left/right
  const flipX = pxX + TOOLTIP_WIDTH_EST + FLIP_MARGIN * 2 > 9999;
  const left = flipX ? undefined : pxX + 14;
  const right = flipX ? `calc(100% - ${pxX - 14}px)` : undefined;

  // Flip up/down
  const flipY = pxY < TOOLTIP_HEIGHT_EST + FLIP_MARGIN;
  const top = flipY ? pxY + 8 : undefined;
  const bottom = flipY ? undefined : `calc(100% - ${pxY - 8}px)`;

  return (
    <div
      style={{
        position: "absolute",
        left,
        right,
        top,
        bottom,
        background: bg,
        color,
        fontSize,
        fontFamily: "monospace",
        borderRadius: 5,
        padding: "6px 10px",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        minWidth: 140,
        maxWidth: TOOLTIP_WIDTH_EST,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ marginBottom: 4, opacity: 0.7, fontSize: fontSize - 1 }}>
        {xLabel}
      </div>
      {points.map((pt) => (
        <div
          key={pt.layerId}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: pt.color,
              flexShrink: 0,
            }}
          />
          <span style={{ opacity: 0.75, flexShrink: 0 }}>{pt.label}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>{pt.yLabel}</span>
        </div>
      ))}
    </div>
  );
}
