import { intervalTicks, niceTicks } from "./math";
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

/**
 * Serializable y-label format. Crosses the worker boundary (structuredClone
 * safe), so it applies in ALL render paths: the worker's in-canvas labels,
 * the external-axis canvas (`drawYAxis`), and the React-side tick set.
 */
export interface YTickFormatOptions {
  /** Fraction digits via `toFixed`. */
  precision?: number;
  /** Unit appended after the number, e.g. `"%"` or `" V"`. */
  suffix?: string;
  /** Scale 1e3/1e6/1e9 down to k/M/G before formatting. Default false. */
  si?: boolean;
}

/**
 * Y tick label format: a serializable options object (works everywhere,
 * including worker-drawn `externalAxes` labels) or a custom function. The
 * function form cannot cross the worker boundary — it is applied on the
 * React side only (`useAxisTicks`), and worker-drawn labels fall back to
 * the default `String(value)`.
 */
export type YTickFormat = YTickFormatOptions | ((v: number) => string);

/**
 * Serializable x-label format. Like {@link YTickFormatOptions} it crosses the
 * worker boundary (structuredClone safe), so it applies in ALL render paths
 * including worker-drawn `externalAxes` labels — unlike a function formatter,
 * which is stripped before postMessage and only applies React-side.
 */
export interface XTickFormatOptions {
  /**
   * Clock pattern for `xMode: "time"` with `timeOrigin` set (e.g. `"HH:mm:ss"`).
   * When omitted in time mode, falls back to the numeric fields below.
   */
  pattern?: string;
  /** Fraction digits via `toFixed`. Used for numeric (non-clock) labels. */
  precision?: number;
  /** Unit appended after the number, e.g. `"ms"` or `" V"`. */
  suffix?: string;
  /** Scale 1e3/1e6/1e9 down to k/M/G before formatting. Default false. */
  si?: boolean;
}

/**
 * X tick label format: a clock-pattern string, a serializable options object
 * (works everywhere, including worker-drawn `externalAxes` labels), or a custom
 * function. The function form cannot cross the worker boundary — it is applied
 * on the React side only (`useAxisTicks`); worker-drawn labels fall back to the
 * raw value. Prefer the string or object form with `externalAxes`.
 */
export type XTickFormat = string | XTickFormatOptions | ((v: number) => string);

export interface ComputeAxisTicksOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  targetTicks?: number;
  xMode?: "fixed" | "time";
  timeOrigin?: number | null;
  xTickFormat?: XTickFormat;
  yTickFormat?: YTickFormat;
  /** Fixed x tick interval (ms). When set, overrides targetTicks. */
  xTickIntervalMs?: number;
}

export function computeAxisTicks(opts: ComputeAxisTicksOptions): AxisTickSet {
  const { xMin, xMax, yMin, yMax, targetTicks = 6 } = opts;

  const xRaw =
    opts.xTickIntervalMs != null
      ? intervalTicks(xMin, xMax, opts.xTickIntervalMs)
      : niceTicks(xMin, xMax, targetTicks);
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
    /* v8 ignore start -- else arm unreachable: niceTicks/intervalTicks return [] when xMax<=xMin, so this map body never runs with a non-positive xSpan */
    fraction: xSpan > 0 ? (v - xMin) / xSpan : 0,
    /* v8 ignore stop */
  }));

  const yTicks: AxisTick[] = yRaw.map((v) => ({
    value: v,
    label: formatYTick(v, opts.yTickFormat),
    /* v8 ignore start -- else arm unreachable: niceTicks returns [] when yMax<=yMin, so this map body never runs with a non-positive ySpan */
    fraction: ySpan > 0 ? (v - yMin) / ySpan : 0,
    /* v8 ignore stop */
  }));

  return { xTicks, yTicks };
}

/**
 * Numeric label formatting shared by {@link formatYTick} and the object form of
 * {@link formatTick}: optional SI scaling (k/M/G), fixed precision, suffix.
 */
function formatNumeric(
  value: number,
  fmt: { precision?: number; suffix?: string; si?: boolean },
): string {
  let v = value;
  let si = "";
  if (fmt.si) {
    const a = Math.abs(v);
    if (a >= 1e9) {
      v /= 1e9;
      si = "G";
    } else if (a >= 1e6) {
      v /= 1e6;
      si = "M";
    } else if (a >= 1e3) {
      v /= 1e3;
      si = "k";
    }
  }
  const text = fmt.precision != null ? v.toFixed(fmt.precision) : String(v);
  return `${text}${si}${fmt.suffix ?? ""}`;
}

/** Format a y tick value per `YTickFormat`; `undefined` → `String(value)`. */
export function formatYTick(value: number, fmt?: YTickFormat): string {
  if (fmt == null) return String(value);
  if (typeof fmt === "function") return fmt(value);
  return formatNumeric(value, fmt);
}

export function formatTick(
  value: number,
  mode: "fixed" | "time",
  timeOrigin: number | null,
  pattern: XTickFormat,
): string {
  if (typeof pattern === "function") return pattern(value);
  // Object form: serializable, works on every render path. In time mode with a
  // known origin and a clock `pattern`, render wall-clock; otherwise numeric.
  if (typeof pattern === "object") {
    if (mode === "time" && timeOrigin != null && pattern.pattern != null) {
      return formatClock(timeOrigin + value, pattern.pattern);
    }
    return formatNumeric(value, pattern);
  }
  if (mode === "time") {
    if (timeOrigin != null) {
      return formatClock(timeOrigin + value, pattern);
    }
    const s = value / 1000;
    return `${s.toFixed(1)}s`;
  }
  return String(value);
}
