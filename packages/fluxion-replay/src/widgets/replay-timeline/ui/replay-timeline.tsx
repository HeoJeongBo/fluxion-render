import type { CSSProperties } from "react";
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
}

export function ReplayTimeline({
  timeline,
  className,
  style,
  formatTime = defaultFormatTime,
}: ReplayTimelineProps): React.ReactElement {
  const { fraction, seekTo, currentT, earliest, latest } = timeline;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekTo(Number(e.target.value) / 10_000);
  };

  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, minWidth: 40 }}>
        {formatTime(currentT, earliest)}
      </span>
      <input
        type="range"
        min={0}
        max={10_000}
        value={Math.round(fraction * 10_000)}
        onChange={handleChange}
        style={{ flex: 1 }}
        aria-label="Replay timeline"
      />
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, minWidth: 40, textAlign: "right" }}>
        {formatTime(latest, earliest)}
      </span>
    </div>
  );
}
