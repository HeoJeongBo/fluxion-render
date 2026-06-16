import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";

export interface LegendItem {
  color: string;
  label: string;
}

export interface FluxionLegendClassNames {
  /** Outermost wrapper div. */
  root?: string;
  /** Individual legend item row div. */
  item?: string;
  /** Color dot span. */
  dot?: string;
  /** Label text span. */
  label?: string;
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
  className?: string;
  classNames?: FluxionLegendClassNames;
}

const POSITION_STYLES: Record<
  NonNullable<FluxionLegendProps["position"]>,
  CSSProperties
> = {
  "top-left": { top: 8, left: 8 },
  "top-right": { top: 8, right: 8 },
  "bottom-left": { bottom: 8, left: 8 },
  "bottom-right": { bottom: 8, right: 8 },
};

export function FluxionLegend({
  items,
  visibility = "always",
  position = "top-right",
  containerRef,
  style,
  className,
  classNames = {},
}: FluxionLegendProps) {
  const [hovered, setHovered] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibility !== "hover") return;
    /* v8 ignore start -- legendRef is set + always has a DOM parent once mounted; null-target guard */
    const target = containerRef?.current ?? legendRef.current?.parentElement ?? null;
    if (!target) return;
    /* v8 ignore stop */
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

  const rootClassName = classNames.root ?? className;
  const rootStyle: CSSProperties = rootClassName
    ? { opacity: visible ? 1 : 0, transition: "opacity 0.15s ease", ...style }
    : {
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
      };

  return (
    <div ref={legendRef} className={rootClassName} style={rootStyle}>
      {items.map((item) => (
        <div
          key={item.label}
          className={classNames.item}
          style={
            classNames.item
              ? undefined
              : { display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }
          }
        >
          <span
            className={classNames.dot}
            style={
              classNames.dot
                ? undefined
                : {
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: item.color,
                    flexShrink: 0,
                  }
            }
          />
          <span
            className={classNames.label}
            style={classNames.label ? undefined : { color: "#1b1f2a" }}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
