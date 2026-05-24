import { useCallback, useMemo, useState } from "react";
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { FluxionCanvas, useMiniChart } from "@heojeongbo/fluxion-render/react";
import {
  MetricChannel,
  type MetricSample,
  type ReplaySession,
} from "@heojeongbo/fluxion-replay";
import {
  useChartReplayBridge,
  useLiveTimeRange,
  useRecordingSession,
  useReplayDvr,
  type UseReplayDvrResult,
  useReplayPlayer,
  useReplayScrubber,
  useReplaySession,
} from "@heojeongbo/fluxion-replay/react";

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

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  bg: "#0f1117",
  panel: "#1a1d27",
  border: "#2a2d3a",
  text: "#e2e8f0",
  textSub: "#8892a4",
  textMuted: "#555e70",
  accent: "#4f8ef7",
  red: "#f87171",
  yellow: "#fbbf24",
  green: "#4ade80",
} as const;

const HZ = 20; // samples per chart per second
const WINDOW_MS = 5_000; // matches pool-demo's 5s window

function btn(active: boolean, danger = false): React.CSSProperties {
  return {
    padding: "5px 14px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${danger ? T.red : active ? T.accent : T.border}`,
    background: danger
      ? "rgba(248,113,113,0.15)"
      : active
        ? T.accent
        : "rgba(255,255,255,0.04)",
    color: danger ? T.red : active ? "#fff" : T.text,
  };
}

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
    <div
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        background: "#0a0c12",
        border: `1px solid ${T.border}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: 5,
          fontSize: 9,
          color: T.textMuted,
          pointerEvents: "none",
          zIndex: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
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

/**
 * How close to the live edge a scrub target must land to be treated as
 * "back to live" instead of "enter DVR". Lets users click near the right
 * end without accidentally jumping into time-travel.
 */
const LIVE_EDGE_EPS_MS = 250;

export function ChartReplayApp() {
  const { session, isReady, enterReplay, exitReplay } =
    useReplaySession(SESSION_OPTS);

  // Shared timeOrigin across every chart on the page. Established once at
  // mount; the chart wire pushes `t - timeOrigin` to dodge Float32 quantisation
  // around `Date.now()` (≈1.78e12 → ~131,072ms bucket size).
  const timeOrigin = useMemo(() => Date.now(), []);

  const [rate, setRate] = useState(1.0);
  const [scrubT, setScrubT] = useState<number | null>(null);

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

  // High-level DVR controller. Phase 18: `autoPlay: false` so the player
  // stays idle while the user scrubs — the chart can hold its backfill
  // window without being slid off by play-forward frames. `commitScrub`
  // explicitly calls `player.play(rate)` on release, giving us a
  // "scrub-then-play" UX: drag to inspect any past moment, release to
  // resume playback from there.
  const dvr = useReplayDvr({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange,
    rate,
    autoPlay: false,
  });

  const replayPlayer = useReplayPlayer(dvr.player);
  const isPlaying = replayPlayer.state === "playing";
  const isLive = !dvr.isDvr;

  // ── Scrubber ──────────────────────────────────────────────────────────────
  // Always rendered. Drag is a PREVIEW (just moves the cursor) — every mode
  // transition (enter / exit / seek) is committed ONCE on release. Without
  // this split, the native <input type=range> fires onChange every pixel
  // mid-drag, which would call dvr.enter() dozens of times in parallel.
  // useReplayDvr.enter cancellation handles that race, but committing on
  // release is the right UX too: the user sees their target before anything
  // happens.
  // All scrubber bookkeeping lives in the library: snap to 1s, floor the bar
  // width so a mount-time { now, now } range still renders visibly, resolve
  // the cursor across live/DVR/drag modes.
  const {
    min: scrubMin,
    max: scrubMax,
    value: scrubValue,
    disabled: scrubDisabled,
  } = useReplayScrubber({
    effectiveTimeRange: dvr.effectiveTimeRange,
    liveTimeRange,
    isDvr: dvr.isDvr,
    replayPlayerT: replayPlayer.currentT,
    scrubT,
    // Anchor the bar's left edge at the page mount = recording start.
    // Without this the left edge would slide as `liveTimeRange.earliest`
    // advances (retention / polling), leaving the scrubber visually
    // "stuck in the past" after DVR exits.
    recordingStartMs: timeOrigin,
  });

  const onScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const range = dvr.effectiveTimeRange;
      if (!range) return;
      const t = Number(e.target.value);
      setScrubT(t);

      if (dvr.isDvr) {
        // Already in DVR — sync seek so the chart shows that moment as the
        // user drags. seek() is synchronous and idempotent.
        dvr.player?.seek(t);
      } else if (t < range.latest - LIVE_EDGE_EPS_MS) {
        // Live → DVR transition. enter() is async; Phase 9 cancellation
        // handles the burst from subsequent onChanges this same drag.
        void dvr.enter(t);
      }
    },
    [dvr],
  );

  const commitScrub = useCallback(() => {
    const t = scrubT;
    const range = dvr.effectiveTimeRange;
    setScrubT(null);
    if (t == null || !range) return;

    if (!dvr.isDvr) {
      // Live → time travel. Ignore micro-drags that stay glued to the live
      // edge to avoid entering DVR on a stray click. autoPlay is disabled
      // on the DVR controller (Phase 18 scrub-then-play UX) so we manually
      // kick off playback once the player exists.
      if (t < range.latest - LIVE_EDGE_EPS_MS) {
        void dvr.enter(t).then(() => dvr.player?.play(rate));
      }
    } else if (t >= (dvr.frozenLatest ?? range.latest) - LIVE_EDGE_EPS_MS) {
      // Pulled the scrubber back to the live edge — drop DVR.
      dvr.exit();
    } else {
      // Mid-DVR seek: snap to the released point AND resume playback so
      // the chart smoothly extends forward from the backfill window.
      dvr.player?.seek(t);
      dvr.player?.play(rate);
    }
  }, [dvr, scrubT, rate]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: T.bg,
        color: T.text,
        fontFamily: "-apple-system, system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: `1px solid ${T.border}`,
          background: T.panel,
          flexShrink: 0,
          height: 44,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>chart-replay · 40 charts</span>
        <span style={{ color: T.textMuted, fontSize: 11 }}>
          {CHART_COUNT} mini charts · {HZ}Hz · {WINDOW_MS / 1000}s window · shared worker pool
        </span>

        {/* Mode badge — makes "am I in DVR or live?" unmissable. The Go Live
            button can scroll out of view on narrow screens, but this stays
            anchored next to the title. */}
        {!isLive && dvr.player && (
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              background: "rgba(251,191,36,0.18)",
              border: `1px solid ${T.yellow}`,
              color: T.yellow,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ▶ TIME-TRAVEL @{" "}
            {new Date(replayPlayer.currentT).toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!isReady && <span style={{ color: T.textMuted, fontSize: 11 }}>Opening IDB…</span>}

          {isReady && isLive && (
            <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>● REC</span>
          )}

          {!isLive && (
            <>
              <button
                onClick={() => (isPlaying ? dvr.player?.pause() : dvr.player?.play(rate))}
                style={btn(true)}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play"}
              </button>
              {([0.5, 1, 2, 4] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRate(r);
                    if (isPlaying) dvr.player?.play(r);
                  }}
                  style={btn(rate === r)}
                >
                  {r}×
                </button>
              ))}
              <button onClick={dvr.exit} style={btn(false, true)}>
                ✕ Go Live
              </button>
            </>
          )}
        </div>
      </div>

      {/* Chart grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 8,
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          gap: 4,
          background: T.bg,
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
        <div
          style={{
            flexShrink: 0,
            padding: "8px 16px",
            background: T.panel,
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <input
            type="range"
            min={scrubMin}
            max={scrubMax}
            // Time travel snaps to 1-second boundaries. Pairs with
            // useReplayPlayer's 1-Hz cursor snap so a drag-and-release lands
            // on the same wall second the user sees in the label.
            step={1000}
            value={scrubValue}
            onChange={onScrubChange}
            onMouseUp={commitScrub}
            onTouchEnd={commitScrub}
            onKeyUp={commitScrub}
            disabled={scrubDisabled}
            style={{
              width: "100%",
              accentColor: isLive ? T.red : T.accent,
              cursor: scrubDisabled ? "not-allowed" : "pointer",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: T.textMuted,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{new Date(scrubMin).toLocaleTimeString("en-US", { hour12: false })}</span>
            <span style={{ color: isLive ? T.red : T.text }}>
              {isLive ? "● LIVE · " : ""}
              {new Date(scrubValue).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span>{new Date(scrubMax).toLocaleTimeString("en-US", { hour12: false })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
