import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";

export interface LegendItem {
  color: string;
  label: string;
}

export interface FluxionLegendProps {
  items: LegendItem[];
  /** Whether to always show the legend or only on container hover. Default: 'always'. */
  visibility?: "always" | "hover";
  /** Corner to anchor the legend. Default: 'top-right'. */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** In 'hover' mode, the container element whose hover state is tracked. Falls back to legend self-hover if omitted. */
  containerRef?: RefObject<HTMLElement | null>;
  style?: CSSProperties;
}

const POSITION_STYLES: Record<NonNullable<FluxionLegendProps["position"]>, CSSProperties> = {
  "top-left":     { top: 8,    left: 8  },
  "top-right":    { top: 8,    right: 8 },
  "bottom-left":  { bottom: 8, left: 8  },
  "bottom-right": { bottom: 8, right: 8 },
};

export function FluxionLegend({
  items,
  visibility = "always",
  position = "top-right",
  containerRef,
  style,
}: FluxionLegendProps) {
  const [hovered, setHovered] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibility !== "hover") return;
    const target = containerRef?.current ?? legendRef.current?.parentElement ?? null;
    if (!target) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    target.addEventListener("mouseenter", enter);
    target.addEventListener("mouseleave", leave);
    return () => {
      target.removeEventListener("mouseenter", enter);
      target.removeEventListener("mouseleave", leave);
    };
  }, [visibility, containerRef]);

  const visible = visibility === "always" || hovered;

  return (
    <div
      ref={legendRef}
      style={{
        position: "absolute",
        ...POSITION_STYLES[position],
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "6px 10px",
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(4px)",
        borderRadius: 6,
        border: "1px solid rgba(0,0,0,0.08)",
        fontSize: 11,
        lineHeight: "16px",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.15s ease",
        ...style,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: item.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#1b1f2a" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
