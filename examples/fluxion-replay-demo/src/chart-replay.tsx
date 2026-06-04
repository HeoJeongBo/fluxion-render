import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { FluxionCanvas, useMiniChart } from "@heojeongbo/fluxion-render/react";
import {
  MetricChannel,
  type MetricSample,
  type ReplaySession,
} from "@heojeongbo/fluxion-replay";
import {
  DvrBadge,
  DvrScrubber,
  PlaybackControls,
  type UseReplayDvrResult,
  useChartReplayBridge,
  useDvrController,
  useLiveTimeRange,
  useRecordingSession,
  useReplaySession,
} from "@heojeongbo/fluxion-replay/react";
import { useMemo, useState } from "react";
import { btn, T } from "./shared";

// ─── Layout ───────────────────────────────────────────────────────────────────

const CHART_COUNT = 40;
const COLS = 8;
const ROWS = Math.ceil(CHART_COUNT / COLS);

const COLORS = [
  "#4fc3f7",
  "#80ffa0",
  "#ffb060",
  "#f48fb1",
  "#ce93d8",
  "#80cbc4",
  "#ffcc02",
  "#ef9a9a",
];

// ─── Channels ─────────────────────────────────────────────────────────────────
// One MetricChannel per chart. Defined at module scope so identity is stable
// across renders — useChartReplay depends on `channel` for effect deps.

interface ChartSpec {
  id: string;
  index: number;
  channel: MetricChannel;
  color: string;
  freqHz: number;
  offset: number;
}

const SPECS: ChartSpec[] = Array.from({ length: CHART_COUNT }, (_, i) => ({
  id: `ch-${i.toString().padStart(2, "0")}`,
  index: i,
  channel: new MetricChannel(`ch-${i.toString().padStart(2, "0")}`),
  color: COLORS[i % COLORS.length]!,
  freqHz: 0.5 + (i % 7) * 0.3,
  offset: i * 0.4,
}));

const SESSION_OPTS = {
  channels: SPECS.map((s) => s.channel),
  retentionMs: 5 * 60_000,
};

// ─── Signal ───────────────────────────────────────────────────────────────────
// Linear up-and-to-the-right ramp. Strictly increasing in t — much easier to
// eyeball whether data is actually flowing than a sine wave (a stuck cursor
// at a peak vs. a trough looks the same; a stuck cursor on a ramp jumps out).
//
// `SAMPLE_BASE_T` shifts wall-clock epoch ms into a small range so the
// y values stay in ~[0, durationSec * slope].

const SAMPLE_BASE_T = Date.now();

export function sampleAt(tMs: number, freqHz: number, offset: number): number {
  const seconds = (tMs - SAMPLE_BASE_T) / 1000;
  // Per-chart slope so the 40-chart grid still looks varied.
  const slope = 0.5 + freqHz * 0.5;
  // Per-chart intercept so charts start at slightly different baselines.
  const intercept = offset * 5;
  return seconds * slope + intercept;
}

const HZ = 20; // samples per chart per second
const WINDOW_MS = 5_000; // matches pool-demo's 5s window

// (theme `T` + `btn` now live in ./shared)

// ─── MiniChart ────────────────────────────────────────────────────────────────
// One chart per channel. Drives live data via useFluxionStream when isLive,
// then hands the same line layer over to useChartReplay during DVR mode.

interface MiniChartProps {
  spec: ChartSpec;
  isLive: boolean;
  session: ReplaySession | null;
  dvr: UseReplayDvrResult;
  /** Shared origin so the chart's Float32 wire format doesn't quantise samples. */
  timeOrigin: number;
}

function MiniChart({ spec, isLive, session, dvr, timeOrigin }: MiniChartProps) {
  const [host, setHost] = useState<FluxionHost | null>(null);

  // useMiniChart bundles the axis-grid + line factory the demo used to
  // inline. The remaining demo-specific styling (hide labels, dashed grid,
  // muted axis colour) goes into the `axis` override.
  const { layers } = useMiniChart({
    color: spec.color,
    lineWidth: 1.25,
    timeWindowMs: WINDOW_MS,
    timeOrigin,
    sampleHz: HZ,
    axis: {
      showXGrid: true,
      showYGrid: true,
      showXLabels: false,
      showYLabels: false,
      gridColor: "rgba(80,90,110,0.18)",
      gridDashArray: [3, 3],
      axisColor: T.textMuted,
      yPadPx: 6,
    },
  });

  // useChartReplayBridge replaces the three-hook chain the demo used to
  // wire by hand (useFluxionStream + useChartReplay + useChartLiveBackfill
  // + isLiveRef closure guard). All four concerns now live inside the
  // bridge — the demo just supplies the live producer and the y-picker.
  useChartReplayBridge<MetricSample>({
    host,
    session,
    dvr,
    isLive,
    channel: spec.channel,
    layerId: "line",
    windowMs: WINDOW_MS,
    liveHz: HZ,
    timeOrigin,
    produce: (wallT) => ({
      name: spec.id,
      value: sampleAt(wallT, spec.freqHz, spec.offset),
    }),
    pickValue: (d) => d.value,
  });

  return (
    <div className="relative min-w-0 min-h-0 border border-app-border rounded overflow-hidden bg-[#0a0c12]">
      <div className="absolute top-[3px] left-[5px] text-[9px] text-app-muted pointer-events-none z-[1] tabular-nums">
        #{spec.index + 1}
      </div>
      <FluxionCanvas
        layers={layers}
        onReady={setHost}
        hostOptions={{ bgColor: "#0a0c12" }}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ChartReplayApp() {
  const { session, isReady, enterReplay, exitReplay } = useReplaySession(SESSION_OPTS);

  // Shared timeOrigin across every chart on the page. Established once at
  // mount; the chart wire pushes `t - timeOrigin` to dodge Float32 quantisation
  // around `Date.now()` (≈1.78e12 → ~131,072ms bucket size).
  const timeOrigin = useMemo(() => Date.now(), []);

  // Poll the recording's time range — the scrubber's right edge tracks it
  // in live mode and uses it for the DVR freeze point.
  const { timeRange: liveTimeRange, seed: seedTimeRange } = useLiveTimeRange(session);

  // The page IS the recording — no manual start/stop. On mount: wipe any
  // The page IS the recording — clear stale frames + start fresh + seed
  // the scrubber timeRange. `useRecordingSession` encapsulates the
  // StrictMode-safe ref guard, the async cancellation, and the
  // seed-after-start sequence the demo used to inline.
  useRecordingSession({
    session,
    enabled: isReady,
    seedTimeRange,
    // No tickers — the per-chart MiniChart pumps record() itself via
    // useChartReplayBridge's tick.
  });

  // One combined controller replaces the session→dvr→rate→player→scrubber
  // hook chain. `autoPlay: false` keeps the player idle while scrubbing so the
  // chart holds its backfill window; the scrubber commit resumes playback.
  const ctl = useDvrController({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange,
    autoPlay: false,
    recordingStartMs: timeOrigin,
  });
  const { dvr, replayPlayer, isLive, isPlaying, rate, setRate } = ctl;

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-app-bg text-app-text font-sans text-[13px]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel shrink-0 h-11">
        <span className="font-bold text-[13px]">chart-replay · 40 charts</span>
        <span className="text-app-muted text-[11px]">
          {CHART_COUNT} mini charts · {HZ}Hz · {WINDOW_MS / 1000}s window · shared worker
          pool
        </span>

        {!isLive && dvr.player && (
          <DvrBadge
            currentT={replayPlayer.currentT}
            textColor={T.yellow}
            backgroundColor="rgba(251,191,36,0.18)"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isReady && <span className="text-app-muted text-[11px]">Opening IDB…</span>}

          {isReady && isLive && (
            <span className="text-app-red text-[11px] font-semibold">● REC</span>
          )}

          {!isLive && (
            <PlaybackControls
              isPlaying={isPlaying}
              rate={rate}
              onPlayPause={() =>
                isPlaying ? dvr.player?.pause() : dvr.player?.play(rate)
              }
              onRateChange={setRate}
              onExit={dvr.exit}
              activeStyle={btn(true)}
              inactiveStyle={btn(false)}
              dangerStyle={btn(false, true)}
            />
          )}
        </div>
      </div>

      {/* Chart grid */}
      <div
        className="flex-1 min-h-0 p-2 grid gap-1 bg-app-bg"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {SPECS.map((spec) => (
          <MiniChart
            key={spec.id}
            spec={spec}
            isLive={isLive}
            session={session}
            dvr={dvr}
            timeOrigin={timeOrigin}
          />
        ))}
      </div>

      {/* Timeline — always visible. Drag from the right edge to time-travel;
          drag back to the right edge to return to live. */}
      {dvr.effectiveTimeRange && (
        <DvrScrubber
          {...ctl.scrubber}
          liveAccentColor={T.red}
          dvrAccentColor={T.accent}
          dvrTextColor={T.text}
          labelColor={T.textMuted}
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            background: T.panel,
            borderTop: `1px solid ${T.border}`,
          }}
        />
      )}
    </div>
  );
}
