import type { CSSProperties } from "react";

const DEFAULT_RATES = [0.5, 1, 2, 4] as const;

export interface PlaybackControlsProps {
  /** Whether the player is currently in the "playing" state. */
  isPlaying: boolean;
  /** Current playback rate (used to highlight the active rate button). */
  rate: number;
  /** Called when the play/pause button is clicked. */
  onPlayPause: () => void;
  /**
   * Called when a rate button is clicked. Receives the new rate value.
   * Pair with `usePlaybackRate.setRate` so the player immediately switches
   * speed when mid-playback.
   */
  onRateChange: (r: number) => void;
  /** Called when the exit button is clicked (e.g. "Go Live"). */
  onExit: () => void;
  /** Rate options to display. Default `[0.5, 1, 2, 4]`. */
  rates?: readonly number[];
  /** Label for the exit button. Default `"Go Live"`. */
  exitLabel?: string;
  /**
   * Styles applied to the **active** buttons (play when playing, current
   * rate). Override to match your UI theme.
   */
  activeStyle?: CSSProperties;
  /**
   * Styles applied to **inactive** buttons (pause when paused, other rates).
   */
  inactiveStyle?: CSSProperties;
  /** Styles applied to the exit/danger button. */
  dangerStyle?: CSSProperties;
}

const DEFAULT_ACTIVE: CSSProperties = {
  padding: "5px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #4f8ef7",
  background: "#4f8ef7",
  color: "#fff",
};

const DEFAULT_INACTIVE: CSSProperties = {
  padding: "5px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #2a2d3a",
  background: "rgba(255,255,255,0.04)",
  color: "#e2e8f0",
};

const DEFAULT_DANGER: CSSProperties = {
  padding: "5px 14px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid #f87171",
  background: "rgba(248,113,113,0.15)",
  color: "#f87171",
};

/**
 * A headless-friendly group of playback control buttons for DVR mode:
 * play/pause, rate selectors (0.5×–4×), and an exit button.
 *
 * Button styles default to a dark-theme palette but can be overridden via
 * `activeStyle`, `inactiveStyle`, and `dangerStyle`.
 *
 * @example
 * const { rate, setRate } = usePlaybackRate({ player: dvr.player });
 * const isPlaying = replayPlayer.state === "playing";
 *
 * <PlaybackControls
 *   isPlaying={isPlaying}
 *   rate={rate}
 *   onPlayPause={() => isPlaying ? dvr.player?.pause() : dvr.player?.play(rate)}
 *   onRateChange={setRate}
 *   onExit={dvr.exit}
 * />
 */
export function PlaybackControls({
  isPlaying,
  rate,
  onPlayPause,
  onRateChange,
  onExit,
  rates = DEFAULT_RATES,
  exitLabel = "Go Live",
  activeStyle,
  inactiveStyle,
  dangerStyle,
}: PlaybackControlsProps): React.ReactElement {
  const active = activeStyle ?? DEFAULT_ACTIVE;
  const inactive = inactiveStyle ?? DEFAULT_INACTIVE;
  const danger = dangerStyle ?? DEFAULT_DANGER;

  return (
    <>
      <button onClick={onPlayPause} style={active}>
        {isPlaying ? "⏸ Pause" : "▶ Play"}
      </button>

      {rates.map((r) => (
        <button
          key={r}
          onClick={() => onRateChange(r)}
          style={rate === r ? active : inactive}
        >
          {r}×
        </button>
      ))}

      <button onClick={onExit} style={danger}>
        ✕ {exitLabel}
      </button>
    </>
  );
}
