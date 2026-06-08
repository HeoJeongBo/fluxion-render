import type { RecordingSegment } from "../../store/model/replay-store";

export interface GapInfo {
  /** Gap start time (= end of the preceding segment). */
  start: number;
  /** Gap end time (= start of the following segment). */
  end: number;
  /** Duration of the gap in milliseconds. */
  durationMs: number;
}

/**
 * Derive the gaps between recorded segments.
 *
 * A gap exists wherever two consecutive segments are separated in time.
 * Open segments (`end === null`) are treated as closed at `latest` for the
 * purpose of gap detection — but because an open segment means recording is
 * still in progress, it is never followed by another segment, so in practice
 * no gap is emitted after it.
 *
 * @example
 * detectGaps([
 *   { start: 0,     end: 2_000 },
 *   { start: 5_000, end: 8_000 },
 * ])
 * // → [{ start: 2_000, end: 5_000, durationMs: 3_000 }]
 */
export function detectGaps(
  segments: readonly RecordingSegment[],
  latest?: number,
): GapInfo[] {
  if (segments.length < 2) return [];

  // Sort a defensive copy — callers (e.g. tests, ad-hoc calls) don't have
  // to guarantee start-ascending order; startSegment() does, but we can't
  // rely on that for all call sites.
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  const gaps: GapInfo[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;
    const gapStart = current.end ?? (latest ?? current.start);
    const gapEnd = next.start;
    if (gapEnd > gapStart) {
      gaps.push({ start: gapStart, end: gapEnd, durationMs: gapEnd - gapStart });
    }
  }
  return gaps;
}
