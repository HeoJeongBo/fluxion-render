import type { CSSProperties } from "react";

export interface GaugeThreshold {
  /** Value at which this color zone starts. */
  value: number;
  /** CSS color for this zone. */
  color: string;
}

export interface FluxionGaugeClassNames {
  /** Outermost wrapper div. */
  root?: string;
  /** Background track circle/rect. */
  track?: string;
  /** Active value arc/bar. */
  arc?: string;
  /** Value text element. */
  valueText?: string;
  /** Label text element. */
  label?: string;
}

export interface FluxionGaugeProps {
  /** Current value to display. */
  value: number;
  /** Minimum of the range. Default 0. */
  min?: number;
  /** Maximum of the range. Default 100. */
  max?: number;
  /**
   * Threshold breakpoints for color zones, sorted ascending by `value`.
   * The zone from `threshold[i].value` to `threshold[i+1].value` uses `threshold[i].color`.
   * Default: green=0, yellow=60, red=80.
   */
  thresholds?: GaugeThreshold[];
  /** Gauge visual style. Default "arc". */
  type?: "arc" | "circle" | "bar";
  /** Width of the gauge track in pixels. Default 10. */
  trackWidth?: number;
  /** Background track color. Default "rgba(255,255,255,0.1)". */
  trackColor?: string;
  /** Optional label shown below the value. */
  label?: string;
  /** Size in pixels (width = height for arc/circle; width for bar). Default 120. */
  size?: number;
  /** Height in pixels (bar only). Default 20. */
  barHeight?: number;
  /** Show numeric value text. Default true. */
  showValue?: boolean;
  /** Format the displayed value. Default: one decimal place. */
  valueFormat?: (v: number) => string;
  style?: CSSProperties;
  className?: string;
  classNames?: FluxionGaugeClassNames;
}

const DEFAULT_THRESHOLDS: GaugeThreshold[] = [
  { value: 0, color: "#4caf50" },
  { value: 60, color: "#ffb060" },
  { value: 80, color: "#ff5252" },
];

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function activeColor(value: number, thresholds: GaugeThreshold[]): string {
  let color = thresholds[0]?.color ?? "#4caf50";
  for (const t of thresholds) {
    if (value >= t.value) color = t.color;
  }
  return color;
}

// ── Arc gauge (225° → -45°, 270° sweep) ─────────────────────────────────────
//
// SVG angle convention: 0° = right, 90° = bottom, 180° = left, 270° = top.
// We sweep from 225° (bottom-left) clockwise to -45° (= 315°, bottom-right),
// which draws the arc across the top — the classic dashboard gauge shape.

function ArcGauge({
  value,
  min = 0,
  max = 100,
  thresholds = DEFAULT_THRESHOLDS,
  trackWidth = 10,
  trackColor = "rgba(0,0,0,0.08)",
  size = 120,
  showValue = true,
  valueFormat,
  label,
  classNames = {},
}: FluxionGaugeProps) {
  const fmt = valueFormat ?? ((v) => v.toFixed(1));
  const fraction = clamp((value - min) / (max - min), 0, 1);
  const color = activeColor(value, thresholds);

  const START = 225;
  const SWEEP = 270;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - trackWidth / 2 - 4;

  const circumference = 2 * Math.PI * r;
  const trackDash = (SWEEP / 360) * circumference;
  const valueDash = fraction * trackDash;
  const rotate = START - 90;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={trackWidth}
        strokeLinecap="round"
        strokeDasharray={`${trackDash} ${circumference}`}
        transform={`rotate(${rotate} ${cx} ${cy})`}
        className={classNames.track}
      />
      {fraction > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={trackWidth}
          strokeLinecap="round"
          strokeDasharray={`${valueDash} ${circumference}`}
          transform={`rotate(${rotate} ${cx} ${cy})`}
          className={classNames.arc}
        />
      )}
      {showValue && (
        <text
          x={cx}
          y={cy + (label ? 0 : size * 0.07)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={classNames.valueText ? undefined : "#333"}
          fontSize={size * 0.18}
          fontFamily="monospace"
          fontWeight="600"
          className={classNames.valueText}
        >
          {fmt(value)}
        </text>
      )}
      {label && (
        <text
          x={cx}
          y={cy + size * 0.16}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={classNames.label ? undefined : "#888"}
          fontSize={size * 0.1}
          fontFamily="sans-serif"
          className={classNames.label}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

// ── Circle gauge (0–360°, full ring) ────────────────────────────────────────

function CircleGauge({
  value,
  min = 0,
  max = 100,
  thresholds = DEFAULT_THRESHOLDS,
  trackWidth = 10,
  trackColor = "rgba(255,255,255,0.1)",
  size = 120,
  showValue = true,
  valueFormat,
  label,
  classNames = {},
}: FluxionGaugeProps) {
  const fmt = valueFormat ?? ((v) => v.toFixed(1));
  const fraction = clamp((value - min) / (max - min), 0, 1);
  const color = activeColor(value, thresholds);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - trackWidth / 2 - 4;
  const circumference = 2 * Math.PI * r;
  const dash = fraction * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={trackWidth}
        className={classNames.track}
      />
      {fraction > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={trackWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className={classNames.arc}
        />
      )}
      {showValue && (
        <text
          x={cx}
          y={cy + 5}
          textAnchor="middle"
          fill={classNames.valueText ? undefined : "#e2e8f0"}
          fontSize={size * 0.18}
          fontFamily="monospace"
          className={classNames.valueText}
        >
          {fmt(value)}
        </text>
      )}
      {label && (
        <text
          x={cx}
          y={cy + size * 0.18}
          textAnchor="middle"
          fill={classNames.label ? undefined : "rgba(255,255,255,0.5)"}
          fontSize={size * 0.1}
          fontFamily="sans-serif"
          className={classNames.label}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

// ── Bar gauge (horizontal) ───────────────────────────────────────────────────

function BarGauge({
  value,
  min = 0,
  max = 100,
  thresholds = DEFAULT_THRESHOLDS,
  trackColor = "rgba(255,255,255,0.1)",
  size = 200,
  barHeight = 20,
  showValue = true,
  valueFormat,
  label,
  classNames = {},
}: FluxionGaugeProps) {
  const fmt = valueFormat ?? ((v) => v.toFixed(1));
  const fraction = clamp((value - min) / (max - min), 0, 1);
  const color = activeColor(value, thresholds);
  const totalH = barHeight + (label ? 28 : 0) + (showValue ? 20 : 0);
  const r = barHeight / 2;

  return (
    <svg width={size} height={totalH} viewBox={`0 0 ${size} ${totalH}`}>
      <rect
        x={0}
        y={0}
        width={size}
        height={barHeight}
        rx={r}
        ry={r}
        fill={trackColor}
        className={classNames.track}
      />
      {fraction > 0 && (
        <rect
          x={0}
          y={0}
          width={fraction * size}
          height={barHeight}
          rx={r}
          ry={r}
          fill={color}
          className={classNames.arc}
        />
      )}
      {showValue && (
        <text
          x={size / 2}
          y={barHeight + 14}
          textAnchor="middle"
          fill={classNames.valueText ? undefined : "#e2e8f0"}
          fontSize={12}
          fontFamily="monospace"
          className={classNames.valueText}
        >
          {fmt(value)}
        </text>
      )}
      {label && (
        <text
          x={size / 2}
          y={barHeight + (showValue ? 28 : 14)}
          textAnchor="middle"
          fill={classNames.label ? undefined : "rgba(255,255,255,0.5)"}
          fontSize={10}
          fontFamily="sans-serif"
          className={classNames.label}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function FluxionGauge(props: FluxionGaugeProps) {
  const { type = "arc", style, className, classNames = {} } = props;
  return (
    <div
      style={{ display: "inline-block", ...style }}
      className={classNames.root ?? className}
    >
      {type === "arc" && <ArcGauge {...props} />}
      {type === "circle" && <CircleGauge {...props} />}
      {type === "bar" && <BarGauge {...props} />}
    </div>
  );
}
