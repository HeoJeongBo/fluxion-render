import type { RecordingSegment } from "../../store/model/replay-store";

/**
 * Snap a target time `t` onto the recorded timeline.
 *
 * - If `t` already falls inside a recorded segment, returns `t` unchanged.
 * - If `t` falls in a gap **before** a future segment, returns the start
 *   of that next segment (forward snap — keeps the user inside playable
 *   data when they scrub through a gap).
 * - If `t` is past every segment, returns the end of the last segment
 *   (or `latest` if the last segment is still open with `end === null`).
 * - If `segments` is empty, returns `t` unchanged.
 *
 * This is the helper DVR scrubbers need so a click in a gap doesn't strand
 * the player on a no-data point — the canonical "video skips ad break"
 * behaviour.
 */
export function snapTimeToSegment(
  t: number,
  segments: readonly RecordingSegment[],
  latest: number,
): number {
  if (segments.length === 0) return t;

  // Inside a segment? Return t as-is.
  for (const seg of segments) {
    const end = seg.end ?? latest;
    if (t >= seg.start && t <= end) return t;
  }

  // In a gap before some future segment? Forward-snap to its start.
  for (const seg of segments) {
    if (seg.start > t) return seg.start;
  }

  // Past the last segment — clamp to its end (or live latest).
  const last = segments[segments.length - 1]!;
  return last.end ?? latest;
}
