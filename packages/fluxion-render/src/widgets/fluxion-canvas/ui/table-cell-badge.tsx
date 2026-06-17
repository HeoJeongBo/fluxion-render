import type { CSSProperties, ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "error";

export interface TableCellBadgeProps {
  children: ReactNode;
  /** Semantic tone → background/text colors. Default "neutral". */
  tone?: BadgeTone;
  /** Override the background color (CSS), taking precedence over `tone`. */
  background?: string;
  /** Override the text color (CSS). */
  color?: string;
  /** Pill (rounded) vs square corners. Default true (pill). */
  pill?: boolean;
  style?: CSSProperties;
  className?: string;
}

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: "rgba(100,116,139,0.15)", fg: "#475569" },
  info: { bg: "rgba(79,195,247,0.18)", fg: "#0369a1" },
  success: { bg: "rgba(38,166,154,0.18)", fg: "#0f766e" },
  warning: { bg: "rgba(255,176,96,0.22)", fg: "#b45309" },
  error: { bg: "rgba(239,83,80,0.18)", fg: "#b91c1c" },
};

/**
 * Small status pill for table cells — threshold/severity coloring without
 * hand-rolling inline styles per cell. Use inside a column `render`:
 * `render: (v) => <TableCellBadge tone={v > 90 ? "error" : "success"}>{v}</TableCellBadge>`.
 */
export function TableCellBadge({
  children,
  tone = "neutral",
  background,
  color,
  pill = true,
  style,
  className,
}: TableCellBadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={className}
      style={
        className
          ? style
          : {
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: pill ? 999 : 4,
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.4,
              background: background ?? t.bg,
              color: color ?? t.fg,
              ...style,
            }
      }
    >
      {children}
    </span>
  );
}
