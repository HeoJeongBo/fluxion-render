import { niceTicks } from "./math";
import { formatClock } from "./time-format";

export interface AxisTick {
  value: number;
  label: string;
  /** Fractional position along the axis [0, 1]. 0 = left/bottom, 1 = right/top. */
  fraction: number;
}

export interface AxisTickSet {
  xTicks: AxisTick[];
  yTicks: AxisTick[];
}

export interface ComputeAxisTicksOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  targetTicks?: number;
  xMode?: "fixed" | "time";
  timeOrigin?: number | null;
  xTickFormat?: string | ((v: number) => string);
}

export function computeAxisTicks(opts: ComputeAxisTicksOptions): AxisTickSet {
  const { xMin, xMax, yMin, yMax, targetTicks = 6 } = opts;

  const xRaw = niceTicks(xMin, xMax, targetTicks);
  const yRaw = niceTicks(yMin, yMax, targetTicks);
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;

  const xTicks: AxisTick[] = xRaw.map((v) => ({
    value: v,
    label: formatTick(
      v,
      opts.xMode ?? "fixed",
      opts.timeOrigin ?? null,
      opts.xTickFormat ?? "HH:mm:ss",
    ),
    fraction: xSpan > 0 ? (v - xMin) / xSpan : 0,
  }));

  const yTicks: AxisTick[] = yRaw.map((v) => ({
    value: v,
    label: String(v),
    fraction: ySpan > 0 ? (v - yMin) / ySpan : 0,
  }));

  return { xTicks, yTicks };
}

export function formatTick(
  value: number,
  mode: "fixed" | "time",
  timeOrigin: number | null,
  pattern: string | ((v: number) => string),
): string {
  if (typeof pattern === "function") return pattern(value);
  if (mode === "time") {
    if (timeOrigin != null) {
      return formatClock(timeOrigin + value, pattern);
    }
    const s = value / 1000;
    return `${s.toFixed(1)}s`;
  }
  return String(value);
}
