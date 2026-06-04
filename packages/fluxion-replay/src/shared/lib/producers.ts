/**
 * Producer factories for `useRecordingSession` channel tickers. These collapse
 * the "synthesise a fake sample each tick" closures that demos and prototypes
 * write by hand into one call. Pure (no React) — exported from the package root.
 *
 * Each factory returns a `produce: (wallT: number) => value` function whose
 * shape matches `RecordingTickerSpec.produce` in `useRecordingSession`.
 */

/** Random source in `[0, 1)`. Override for deterministic tests. */
export type Rng = () => number;

export interface LogSample {
  level: string;
  message: string;
}

export interface RandomLogProducerOptions {
  /** Pool of messages to pick from at random. */
  messages: readonly string[];
  /**
   * Levels to pick from at random. Repeat a level to weight it — the default
   * `["info", "info", "warn", "error"]` makes `info` twice as likely.
   */
  levels?: readonly string[];
  /** Random source in `[0, 1)`. Default `Math.random`. */
  rng?: Rng;
  /**
   * Called with each generated entry (plus the tick's `wallT`) before it is
   * returned. Use this to append to a capped live-log buffer in React state,
   * folding that side effect into the producer so the demo's `produce`
   * closure stays a one-liner.
   */
  onEmit?: (entry: { t: number; level: string; message: string }) => void;
}

const DEFAULT_LEVELS = ["info", "info", "warn", "error"] as const;

function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/**
 * Build a `produce` that emits a random `{ level, message }` each tick.
 *
 * @example
 * useRecordingSession({
 *   session,
 *   enabled,
 *   channels: [{
 *     channelId: "system",
 *     intervalMs: 2000,
 *     produce: createRandomLogProducer({
 *       messages: SYSTEM_MSGS,
 *       onEmit: (e) => setLiveLogs((prev) => [...prev.slice(-49), { ...e, channel: "system" }]),
 *     }),
 *   }],
 * });
 */
export function createRandomLogProducer(
  opts: RandomLogProducerOptions,
): (wallT: number) => LogSample {
  const { messages, levels = DEFAULT_LEVELS, rng = Math.random, onEmit } = opts;
  return (wallT: number): LogSample => {
    const level = pick(levels, rng);
    const message = pick(messages, rng);
    onEmit?.({ t: wallT, level, message });
    return { level, message };
  };
}

export interface MetricSampleShape {
  name: string;
  value: number;
}

export interface NoisyMetricProducerOptions {
  /** Sample name, echoed in the returned `{ name, value }`. */
  name: string;
  /** Baseline value before noise is added. */
  base: number;
  /** Max additive noise — `value = base + rng() * amplitude`. */
  amplitude: number;
  /** Decimal places to round to. Default `1`. */
  digits?: number;
  /** Random source in `[0, 1)`. Default `Math.random`. */
  rng?: Rng;
  /** Called with each generated sample. */
  onEmit?: (sample: { t: number; name: string; value: number }) => void;
}

/**
 * Build a `produce` that emits a noisy `{ name, value }` metric each tick.
 *
 * @example
 * produce: createNoisyMetricProducer({ name: "cpu", base: 30, amplitude: 50 })
 * // → { name: "cpu", value: 30..80 }
 */
export function createNoisyMetricProducer(
  opts: NoisyMetricProducerOptions,
): (wallT: number) => MetricSampleShape {
  const { name, base, amplitude, digits = 1, rng = Math.random, onEmit } = opts;
  return (wallT: number): MetricSampleShape => {
    const value = Number((base + rng() * amplitude).toFixed(digits));
    onEmit?.({ t: wallT, name, value });
    return { name, value };
  };
}
