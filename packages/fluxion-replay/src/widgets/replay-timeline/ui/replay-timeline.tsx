import type { CSSProperties } from "react";
import { detectGaps } from "../../../features/session/lib/detect-gaps";
import type { RecordingSegment } from "../../../features/store/model/replay-store";
import type { UseReplayTimelineResult } from "../lib/use-replay-timeline";

function defaultFormatTime(t: number, earliest: number): string {
  const elapsed = Math.max(0, t - earliest);
  const totalSec = Math.floor(elapsed / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export interface ReplayTimelineProps {
  timeline: UseReplayTimelineResult;
  className?: string;
  style?: CSSProperties;
  formatTime?: (t: number, earliest: number) => string;
  /**
   * Recording segments to visualise on the track. When provided, each segment
   * is highlighted and gaps between segments are rendered with a hatched
   * "no-data" pattern. Seeking into a gap automatically snaps to the next
   * segment (via `useReplayTimeline`'s built-in `snapTimeToSegment`).
   */
  segments?: readonly RecordingSegment[];
  /** Override the colour used to highlight recorded segments. */
  segmentColor?: string;
  /** Override styles applied to gap regions (the hatched overlay divs). */
  gapStyle?: CSSProperties;
}

const DEFAULT_SEGMENT_COLOR = "rgba(79, 142, 247, 0.45)";

const DEFAULT_GAP_STYLE: CSSProperties = {
  background:
    "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0.18) 6px)",
  cursor: "not-allowed",
};

export function ReplayTimeline({
  timeline,
  className,
  style,
  formatTime = defaultFormatTime,
  segments,
  segmentColor = DEFAULT_SEGMENT_COLOR,
  gapStyle,
}: ReplayTimelineProps): React.ReactElement {
  const { fraction, seekTo, currentT, earliest, latest } = timeline;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(e.target.value) / 10_000);
  };

  const duration = latest - earliest;
  const effectiveSegments = segments ?? timeline.segments;
  const showTrack = effectiveSegments.length > 0 && duration > 0;
  const gaps = showTrack ? detectGaps(effectiveSegments, latest) : [];

  const toPercent = (t: number) =>
    `${Math.max(0, Math.min(100, ((t - earliest) / duration) * 100))}%`;

  const toWidth = (start: number, end: number) =>
    `${Math.max(0, Math.min(100, ((end - start) / duration) * 100))}%`;

  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: 8, ...style }}
    >
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, minWidth: 40 }}>
        {formatTime(currentT, earliest)}
      </span>

      <div style={{ flex: 1, position: "relative" }}>
        {/* Segment + gap track overlay */}
        {showTrack && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Segment bars */}
            {effectiveSegments.map((seg, i) => {
              const segEnd = seg.end ?? latest;
              if (segEnd <= seg.start) return null;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: toPercent(seg.start),
                    width: toWidth(seg.start, Math.min(segEnd, latest)),
                    height: 4,
                    borderRadius: 2,
                    background: segmentColor,
                  }}
                />
              );
            })}

            {/* Gap hatched overlays */}
            {gaps.map((gap, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: toPercent(gap.start),
                  width: toWidth(gap.start, gap.end),
                  top: 0,
                  bottom: 0,
                  borderRadius: 2,
                  ...DEFAULT_GAP_STYLE,
                  ...gapStyle,
                }}
              />
            ))}
          </div>
        )}

        <input
          type="range"
          min={0}
          max={10_000}
          value={Math.round(fraction * 10_000)}
          onChange={handleChange}
          style={{ width: "100%", display: "block" }}
          aria-label="Replay timeline"
        />
      </div>

      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
          minWidth: 40,
          textAlign: "right",
        }}
      >
        {formatTime(latest, earliest)}
      </span>
    </div>
  );
}
