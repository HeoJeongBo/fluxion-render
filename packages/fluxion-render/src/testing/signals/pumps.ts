import { mulberry32 } from "./mulberry32";

/**
 * Sample-at-t signal generators. Each `create*(opts)` returns a
 * `(tMs: number) => number` closure that produces a value for any
 * (host-relative or wall-clock) timestamp.
 *
 * These are the test/demo signal shapes the streaming examples in this
 * monorepo use. They're exported here so consumer apps can drive their
 * own integration tests / Storybook stories with the same fixtures
 * without copy-pasting the math.
 */

export interface SineSynthOptions {
  /** Primary oscillation frequency in Hz. Default `0.8`. */
  freqHz?: number;
  /** Peak amplitude of the carrier. Default `1`. */
  amplitude?: number;
  /** Phase offset (radians) — handy for fan-out across multi-series demos
   *  so the lines don't all align. Default `0`. */
  seriesOffset?: number;
  /** Add a low-frequency drift overlay (slow wander). Default `true`. */
  drift?: boolean;
  /** Add small random jitter so the line isn't perfectly smooth.
   *  Default `0.2` (peak). Set `0` to disable. */
  noise?: number;
  /** Seed for the noise PRNG. Default `0x9e3779b9`. Pin if you need
   *  reproducible snapshots. */
  noiseSeed?: number;
}

/**
 * Multi-harmonic sine with optional drift + bounded noise. Common shape
 * for "streaming line chart" demos — visually interesting yet stable.
 *
 * @example
 * const sample = createSineSynth({ freqHz: 0.5, amplitude: 0.8 });
 * const y = sample(performance.now());
 */
export function createSineSynth(
  opts: SineSynthOptions = {},
): (tMs: number) => number {
  const {
    freqHz = 0.8,
    amplitude = 1,
    seriesOffset = 0,
    drift = true,
    noise = 0.2,
    noiseSeed = 0x9e3779b9,
  } = opts;
  const rand = noise > 0 ? mulberry32(noiseSeed) : null;

  return (tMs: number): number => {
    const ts = tMs / 1000;
    const carrier =
      Math.sin(2 * Math.PI * freqHz * ts + seriesOffset) * amplitude;
    const harmonic =
      Math.sin(2 * Math.PI * freqHz * 2.7 * ts + seriesOffset) *
      amplitude *
      0.4;
    const driftTerm = drift
      ? Math.sin(2 * Math.PI * 0.07 * ts + seriesOffset * 0.5) * 0.3
      : 0;
    const noiseTerm = rand ? (rand() - 0.5) * noise : 0;
    return carrier + harmonic + driftTerm + noiseTerm;
  };
}

export interface LinearRampOptions {
  /** Units per second. Default `1`. */
  slope?: number;
  /** Constant offset (y at t = baseT). Default `0`. */
  intercept?: number;
  /** Wall-clock timestamp that maps to `intercept`. Default `0`. */
  baseT?: number;
}

/**
 * Strictly monotone-up line of value vs time. Perfect for "is data
 * actually flowing?" smoke tests — a stuck or rewound cursor stands out
 * because the line is unambiguous.
 *
 * @example
 * const sample = createLinearRamp({ slope: 0.5, baseT: Date.now() });
 * sample(Date.now()); // 0
 * sample(Date.now() + 1000); // 0.5
 */
export function createLinearRamp(
  opts: LinearRampOptions = {},
): (tMs: number) => number {
  const { slope = 1, intercept = 0, baseT = 0 } = opts;
  return (tMs: number): number => {
    const seconds = (tMs - baseT) / 1000;
    return seconds * slope + intercept;
  };
}
