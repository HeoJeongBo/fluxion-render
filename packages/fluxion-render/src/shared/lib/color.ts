/**
 * Intensity (0..1) → viridis-ish RGB LUT.
 * Precomputed 256-entry lookup to avoid per-point math during rendering.
 */
const LUT_SIZE = 256;
const lutR = new Uint8ClampedArray(LUT_SIZE);
const lutG = new Uint8ClampedArray(LUT_SIZE);
const lutB = new Uint8ClampedArray(LUT_SIZE);

function ramp(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [13, 8, 135]],
    [0.25, [84, 2, 163]],
    [0.5, [156, 23, 158]],
    [0.75, [225, 100, 98]],
    [1.0, [240, 249, 33]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

for (let i = 0; i < LUT_SIZE; i++) {
  const [r, g, b] = ramp(i / (LUT_SIZE - 1));
  lutR[i] = r;
  lutG[i] = g;
  lutB[i] = b;
}

export interface IntensityLUT {
  readonly r: Uint8ClampedArray;
  readonly g: Uint8ClampedArray;
  readonly b: Uint8ClampedArray;
  readonly size: number;
}

const SINGLETON: IntensityLUT = Object.freeze({
  r: lutR,
  g: lutG,
  b: lutB,
  size: LUT_SIZE,
});

export function intensityLUT(): IntensityLUT {
  return SINGLETON;
}
