/**
 * Demo-local shared module.
 *
 * Holds everything the four replay demos duplicated that is COUPLED to this
 * demo's Tailwind setup (the `T` dark theme, `btn`/`btnClass`, the className-
 * styled `LiveLogRow`/`FrameRow`/`SectionHeader` rows) plus shared channel ids
 * and sample data. These cannot live in @heojeongbo/fluxion-replay, which is
 * styling-agnostic (inline CSSProperties only) — so they live here and every
 * demo imports from "./shared".
 *
 * Pure logic/format/producer helpers DO live in the library — import those from
 * @heojeongbo/fluxion-replay (formatMs, formatBytes, createRandomLogProducer,
 * createNoisyMetricProducer) and @heojeongbo/fluxion-replay/react (useDvrController).
 */
import { formatMs, type ReplayPlayerFrame } from "@heojeongbo/fluxion-replay";

// ─── Channel ids (shared across demos) ──────────────────────────────────────

export const VIDEO_CHANNEL_ID = "screen";
export const CPU_CHANNEL_ID = "cpu";
export const MEM_CHANNEL_ID = "memory";
export const LOG_CHANNEL_ID = "system";
export const LOG2_CHANNEL_ID = "events";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MetricSample {
  name: string;
  value: number;
}
export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
}
export interface LiveLogEntry {
  t: number;
  channel: string;
  level: string;
  message: string;
}

// ─── Theme (dark) — mirrors the app-* tokens in tailwind.config.js ───────────
// Kept as a JS object because it's also passed to canvas/layer color props
// (bgColor, axisColor, …) and to library components' CSSProperties color props.

export const T = {
  bg: "#0f1117",
  panel: "#1a1d27",
  border: "#2a2d3a",
  text: "#e2e8f0",
  textSub: "#8892a4",
  textMuted: "#555e70",
  accent: "#4f8ef7",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
} as const;

// ─── Button helpers ──────────────────────────────────────────────────────────

/** CSSProperties variant — for <PlaybackControls> (its style props are CSSProperties). */
export function btn(
  active: boolean,
  danger = false,
  highlight = false,
): React.CSSProperties {
  return {
    padding: "5px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${danger ? T.red : highlight ? T.green : active ? T.accent : T.border}`,
    background: danger
      ? "rgba(248,113,113,0.15)"
      : highlight
        ? "rgba(74,222,128,0.15)"
        : active
          ? T.accent
          : "rgba(255,255,255,0.04)",
    color: danger ? T.red : highlight ? T.green : active ? "#fff" : T.text,
  };
}

/** className variant — for plain <button> elements. Maps to .btn* in index.css. */
export function btnClass(active: boolean, danger = false, highlight = false): string {
  return `btn ${danger ? "btn-danger" : highlight ? "btn-highlight" : active ? "btn-active" : "btn-default"}`;
}

// ─── Sample data ──────────────────────────────────────────────────────────────

export const SYSTEM_MSGS = [
  "CPU spike detected",
  "Memory pressure: GC triggered",
  "Disk I/O latency high",
  "Network interface reset",
  "Thermal throttling active",
  "Swap usage elevated",
  "Kernel OOM killer invoked",
];
export const APP_MSGS = [
  "User interaction captured",
  "Frame dropped: buffer overflow",
  "Stream reconnected",
  "Codec negotiation complete",
  "Keyframe requested",
  "Pipeline stall detected",
  "Encoder queue flushed",
];

// ─── Presentational rows / header ─────────────────────────────────────────────

export function SectionHeader({
  label,
  dot,
  dotBlink,
  extra,
}: {
  label: string;
  dot: string;
  dotBlink?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-app-border bg-app-panel shrink-0">
      <span
        className="w-[7px] h-[7px] rounded-full shrink-0"
        style={{
          background: dot,
          animation: dotBlink ? "pulse 1.2s ease-in-out infinite" : undefined,
        }}
      />
      <span className="text-[10px] font-bold tracking-[0.08em] text-app-sub">
        {label}
      </span>
      {extra}
    </div>
  );
}

export function LiveLogRow({ log }: { log: LiveLogEntry }) {
  return (
    <div className="flex gap-2.5 px-3 py-0.5 border-b border-app-border">
      <span className="text-app-sub min-w-[72px] tabular-nums">
        {new Date(log.t).toLocaleTimeString("en-US", { hour12: false })}
      </span>
      <span
        className="min-w-[52px] font-semibold"
        style={{ color: log.channel === LOG_CHANNEL_ID ? T.yellow : "#c084fc" }}
      >
        {log.channel}
      </span>
      <span
        className="flex-1 truncate"
        style={{
          color: log.level === "error" ? T.red : log.level === "warn" ? T.yellow : T.text,
        }}
      >
        {log.message}
      </span>
    </div>
  );
}

export function FrameRow({
  frame,
  earliest,
}: {
  frame: ReplayPlayerFrame;
  earliest: number;
}) {
  const channelColor =
    frame.channelId === LOG_CHANNEL_ID
      ? T.yellow
      : frame.channelId === LOG2_CHANNEL_ID
        ? "#c084fc"
        : frame.channelId === CPU_CHANNEL_ID
          ? T.accent
          : T.green;
  const data = frame.data as Record<string, unknown>;
  const logLevel = data.level as string | undefined;
  return (
    <div className="flex gap-2.5 px-3 py-0.5 border-b border-app-border">
      <span className="text-app-sub min-w-[72px] tabular-nums text-[11px]">
        {new Date(frame.t).toLocaleTimeString("en-US", { hour12: false })}
      </span>
      <span className="text-app-muted min-w-[42px] tabular-nums text-[10px]">
        +{formatMs(frame.t - earliest)}
      </span>
      <span className="min-w-[52px] font-semibold" style={{ color: channelColor }}>
        {frame.channelId}
      </span>
      <span
        className="flex-1 truncate"
        style={{
          color: logLevel === "error" ? T.red : logLevel === "warn" ? T.yellow : T.text,
        }}
      >
        {JSON.stringify(frame.data)}
      </span>
    </div>
  );
}
