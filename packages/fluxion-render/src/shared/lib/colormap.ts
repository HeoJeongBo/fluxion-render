/**
 * Shared 256-entry RGB colormap lookup tables.
 *
 * The viridis/plasma/hot palettes were historically duplicated inside several
 * layer implementations (heatmap, heatmap-stream, scatter-colored). New layers
 * that map a normalised 0–1 value to a color should import from here instead of
 * redefining the stops, so the palettes stay consistent across the library.
 *
 * Each LUT is a flat `Uint8Array` of `256 * 3` bytes: `[r0,g0,b0, r1,g1,b1, …]`.
 * Index a value `v` in `[0,1]` with `Math.floor(v * 255) * 3`.
 */

export type ColormapName = "viridis" | "plasma" | "hot";

type Stop = [number, number, number, number];

/** Build a 256-entry RGB LUT by linearly interpolating between color stops. */
export function buildLut(stops: Stop[]): Uint8Array {
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < stops.length - 1 && stops[j + 1]![0]! < t) j++;
    const [t0, r0, g0, b0] = stops[j]!;
    const [t1, r1, g1, b1] = stops[Math.min(j + 1, stops.length - 1)]!;
    /* v8 ignore start -- t0===t1 unreachable: stop times strictly increasing, j capped at length-2 */
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    /* v8 ignore stop */
    out[i * 3] = Math.round(r0 + (r1 - r0) * f);
    out[i * 3 + 1] = Math.round(g0 + (g1 - g0) * f);
    out[i * 3 + 2] = Math.round(b0 + (b1 - b0) * f);
  }
  return out;
}

/** Build a 256-entry RGB LUT linearly interpolating two CSS hex colors. */
export function buildGradientLut(fromHex: string, toHex: string): Uint8Array {
  const [r0, g0, b0] = hexToRgb(fromHex);
  const [r1, g1, b1] = hexToRgb(toHex);
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = i / 255;
    out[i * 3] = Math.round(r0 + (r1 - r0) * f);
    out[i * 3 + 1] = Math.round(g0 + (g1 - g0) * f);
    out[i * 3 + 2] = Math.round(b0 + (b1 - b0) * f);
  }
  return out;
}

/** Parse a 3- or 6-digit CSS hex string to an `[r, g, b]` triple. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export const VIRIDIS_LUT = buildLut([
  [0.0, 68, 1, 84],
  [0.25, 59, 82, 139],
  [0.5, 33, 145, 140],
  [0.75, 94, 201, 98],
  [1.0, 253, 231, 37],
]);

export const PLASMA_LUT = buildLut([
  [0.0, 13, 8, 135],
  [0.25, 126, 3, 168],
  [0.5, 204, 71, 120],
  [0.75, 248, 149, 64],
  [1.0, 240, 249, 33],
]);

export const HOT_LUT = buildLut([
  [0.0, 0, 0, 0],
  [0.333, 255, 0, 0],
  [0.667, 255, 255, 0],
  [1.0, 255, 255, 255],
]);

/** Resolve a colormap name to its LUT (defaults to viridis). */
export function lutFor(name: ColormapName | undefined): Uint8Array {
  return name === "plasma" ? PLASMA_LUT : name === "hot" ? HOT_LUT : VIRIDIS_LUT;
}
