import type { CSSProperties } from "react";

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
}: DvrScrubberProps): React.ReactElement {
  const accentColor = isLive ? liveAccentColor : dvrAccentColor;
  const centreColor = isLive ? (liveTextColor ?? liveAccentColor) : dvrTextColor;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
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
          width: "100%",
          accentColor,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      />
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
