import type { CSSProperties } from "react";

function defaultFormatTime(tMs: number): string {
  return new Date(tMs).toLocaleTimeString("en-US", { hour12: false });
}

export interface DvrBadgeProps {
  /**
   * Current player position in milliseconds (`player.currentT` or
   * `replayPlayer.currentT`). Displayed as a wall-clock time after the label.
   */
  currentT: number;
  /**
   * Custom time formatter. Receives the millisecond timestamp and returns the
   * display string. Default: `HH:MM:SS` in 24-hour local time.
   */
  formatTime?: (tMs: number) => string;
  /**
   * Text shown before the formatted time. Default `"▶ TIME-TRAVEL"`.
   */
  label?: string;
  /** Override color of the badge text and border. Default `"#fbbf24"` (yellow). */
  textColor?: string;
  /** Override badge background color. Default `"rgba(251,191,36,0.18)"`. */
  backgroundColor?: string;
  /** Override border color. Defaults to `textColor`. */
  borderColor?: string;
  /** Additional style overrides for the container `<span>`. */
  style?: CSSProperties;
}

/**
 * Compact badge that shows the current DVR playback position.
 *
 * Typically rendered in a top bar next to the title when `!isLive`:
 *
 * @example
 * {!isLive && dvr.player && (
 *   <DvrBadge currentT={replayPlayer.currentT} />
 * )}
 *
 * Override colours to match your theme:
 * @example
 * <DvrBadge
 *   currentT={replayPlayer.currentT}
 *   textColor="#fbbf24"
 *   backgroundColor="rgba(251,191,36,0.18)"
 * />
 */
export function DvrBadge({
  currentT,
  formatTime = defaultFormatTime,
  label = "▶ TIME-TRAVEL",
  textColor = "#fbbf24",
  backgroundColor = "rgba(251,191,36,0.18)",
  borderColor,
  style,
}: DvrBadgeProps): React.ReactElement {
  const resolvedBorder = borderColor ?? textColor;

  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: backgroundColor,
        border: `1px solid ${resolvedBorder}`,
        color: textColor,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {label} @ {formatTime(currentT)}
    </span>
  );
}
