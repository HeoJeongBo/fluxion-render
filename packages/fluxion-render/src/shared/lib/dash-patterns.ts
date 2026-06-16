/**
 * Deterministic dash palette for telling overlapping series apart.
 *
 * When two or more line/area/step series sit at nearly the same value (common
 * with flat or slowly-varying signals) color alone isn't enough — the strokes
 * land on the same pixels. Assigning each series a distinct `setLineDash`
 * pattern keeps them readable even when fully overlapping, deterministically
 * (no runtime overlap detection, no flicker).
 *
 * Index 0 is solid; cycle with {@link dashPatternFor}. Values are CSS px and
 * feed `LineChartConfig.dashArray` (and the area/step equivalents).
 */
export const DASH_PATTERNS: readonly (readonly number[])[] = [
  [], // solid
  [6, 4], // dashed
  [2, 3], // dotted
  [10, 4, 2, 4], // dash-dot
  [8, 3], // long dash
];

/**
 * Returns a fresh `dashArray` for series index `i`, cycling {@link DASH_PATTERNS}.
 * The returned array is a copy, safe to hand to a layer config.
 */
export function dashPatternFor(i: number): number[] {
  return [...DASH_PATTERNS[i % DASH_PATTERNS.length]!];
}
