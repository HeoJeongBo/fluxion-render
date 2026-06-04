import type { CSSProperties } from "react";
import type { RecordingSegment } from "../../../features/store/model/replay-store";

export interface DvrScrubberProps {
  /** Lower bound in milliseconds (from `useReplayScrubber`). */
  min: number;
  /** Upper bound in milliseconds (from `useReplayScrubber`). */
  max: number;
  /** Current cursor value in milliseconds (from `useReplayScrubber`). */
  value: number;
  /** When true the scrubber is read-only (from `useReplayScrubber`). */
  disabled: boolean;

  /** `onChange` from `useScrubberControls` — fires on every drag event. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /**
   * Commit handler from `useScrubberControls` — wire to `onMouseUp`,
   * `onTouchEnd`, and `onKeyUp` to finalise the scrub target on release.
   */
  onCommit: () => void;

  /** Whether the chart is currently in live mode (`!dvr.isDvr`). */
  isLive: boolean;

  /**
   * Accent color for the range track while in live mode.
   * Default `"#f87171"` (red).
   */
  liveAccentColor?: string;
  /**
   * Accent color for the range track while in DVR mode.
   * Default `"#4f8ef7"` (blue).
   */
  dvrAccentColor?: string;
  /**
   * Text color for the centre label while in live mode.
   * Defaults to `liveAccentColor`.
   */
  liveTextColor?: string;
  /**
   * Text color for the centre label while in DVR mode.
   * Defaults to inherited / undefined (picks up from `labelColor`).
   */
  dvrTextColor?: string;
  /**
   * Text displayed before the current time when live.
   * Default `"● LIVE · "`.
   */
  liveBadgeText?: string;
  /**
   * Muted color used for the timestamp labels and track label row.
   * Default `"#555e70"`.
   */
  labelColor?: string;

  /**
   * Custom time formatter. Receives a millisecond wall-clock timestamp and
   * returns the string to display. Default: `HH:MM:SS` in local time using
   * the 24-hour clock (`toLocaleTimeString("en-US", { hour12: false })`).
   */
  formatTime?: (tMs: number) => string;

  /** Style overrides for the outer container `<div>`. */
  style?: CSSProperties;

  /**
   * Optional recording segments to visualise as filled bars behind the range
   * track — useful when the recording has gaps. Each segment's position is
   * derived from `min`/`max` (segments outside that window are clipped). Bars
   * use `liveAccentColor`/`dvrAccentColor` to match the current mode. Omit (or
   * pass `[]`) to render no overlay — the default.
   */
  segments?: RecordingSegment[];
}

function defaultFormatTime(tMs: number): string {
  return new Date(tMs).toLocaleTimeString("en-US", { hour12: false });
}

/**
 * Compact scrubber bar for DVR replay UIs. Renders an `<input type="range">`
 * with left/centre/right timestamp labels and live-vs-DVR colour theming.
 *
 * Wire directly from `useReplayScrubber` + `useScrubberControls`:
 *
 * @example
 * const { min, max, value, disabled } = useReplayScrubber({ ... });
 * const { onScrubChange, commitScrub } = useScrubberControls({ dvr, rate });
 *
 * {dvr.effectiveTimeRange && (
 *   <DvrScrubber
 *     min={min} max={max} value={value} disabled={disabled}
 *     onChange={onScrubChange} onCommit={commitScrub}
 *     isLive={isLive}
 *   />
 * )}
 */
export function DvrScrubber({
  min,
  max,
  value,
  disabled,
  onChange,
  onCommit,
  isLive,
  liveAccentColor = "#f87171",
  dvrAccentColor = "#4f8ef7",
  liveTextColor,
  dvrTextColor,
  liveBadgeText = "● LIVE · ",
  labelColor = "#555e70",
  formatTime = defaultFormatTime,
  style,
  segments,
}: DvrScrubberProps): React.ReactElement {
  const accentColor = isLive ? liveAccentColor : dvrAccentColor;
  const centreColor = isLive ? (liveTextColor ?? liveAccentColor) : dvrTextColor;

  // Segment overlay: position each recorded span relative to the [min, max]
  // window. An open segment (`end === null`) extends to `max`.
  const span = max - min;
  const bars =
    span > 0 && segments && segments.length > 0
      ? segments
          .map((seg) => {
            const segEnd = seg.end ?? max;
            const left = ((seg.start - min) / span) * 100;
            const width = ((Math.min(segEnd, max) - seg.start) / span) * 100;
            return { left, width };
          })
          .filter((b) => b.width > 0)
      : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
      <div style={{ position: "relative" }}>
        {bars.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              height: 4,
              borderRadius: 2,
              pointerEvents: "none",
            }}
          >
            {bars.map((b, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${b.left}%`,
                  width: `${b.width}%`,
                  height: "100%",
                  background: accentColor,
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={1000}
          value={value}
          onChange={onChange}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
          onKeyUp={onCommit}
          disabled={disabled}
          style={{
            position: "relative",
            width: "100%",
            accentColor,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: labelColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{formatTime(min)}</span>
        <span style={centreColor ? { color: centreColor } : undefined}>
          {isLive ? liveBadgeText : ""}
          {formatTime(value)}
        </span>
        <span>{formatTime(max)}</span>
      </div>
    </div>
  );
}
