import type { CSSProperties } from "react";

export interface SparklineProps {
  /** Recent values, oldest → newest. Fewer than 2 points renders nothing. */
  data: readonly number[];
  /** Width in px. Default 80. */
  width?: number;
  /** Height in px. Default 20. */
  height?: number;
  /** Stroke color. Default "#4fc3f7". */
  color?: string;
  /** Stroke width in px. Default 1.5. */
  strokeWidth?: number;
  /** Fill the area under the line at this opacity (0 = no fill). Default 0. */
  fillOpacity?: number;
  /** Draw a dot at the last point. Default true. */
  showLast?: boolean;
  /**
   * Fixed value range `[min, max]`. When omitted, auto-scales to the data's own
   * min/max each render (good for trend shape, not absolute comparison).
   */
  range?: [number, number];
  style?: CSSProperties;
  className?: string;
}

/**
 * Tiny inline trend line for table cells (or anywhere). Pure SVG — no canvas,
 * no worker — so it's cheap to render hundreds of them. Drop into a column's
 * `render`: `render: (_v, row) => <Sparkline data={row.history} />`.
 */
export function Sparkline({
  data,
  width = 80,
  height = 20,
  color = "#4fc3f7",
  strokeWidth = 1.5,
  fillOpacity = 0,
  showLast = true,
  range,
  style,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    return <svg width={width} height={height} style={style} className={className} />;
  }

  let lo: number;
  let hi: number;
  if (range) {
    [lo, hi] = range;
  } else {
    lo = Number.POSITIVE_INFINITY;
    hi = Number.NEGATIVE_INFINITY;
    for (const v of data) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = hi - lo || 1;
  const pad = strokeWidth;
  const usableH = height - pad * 2;
  const n = data.length;

  const x = (i: number) => (i / (n - 1)) * width;
  const y = (v: number) => pad + (1 - (v - lo) / span) * usableH;

  let d = "";
  for (let i = 0; i < n; i++) {
    d += `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(data[i]!).toFixed(1)}`;
  }
  const areaD =
    fillOpacity > 0 ? `${d}L${width.toFixed(1)},${height}L0,${height}Z` : undefined;

  const lastX = x(n - 1);
  const lastY = y(data[n - 1]!);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={style}
      className={className}
      role="img"
      aria-label="sparkline"
    >
      {areaD && <path d={areaD} fill={color} fillOpacity={fillOpacity} stroke="none" />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} />
      {showLast && <circle cx={lastX} cy={lastY} r={strokeWidth + 0.5} fill={color} />}
    </svg>
  );
}
