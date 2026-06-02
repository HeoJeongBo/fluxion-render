/**
 * Worker Fan-Out Replay Demo
 *
 * Combines the stream-worker-demo pattern (broadcastStream → 1 worker →
 * N chart engines) with the DVR replay system.
 *
 * Data flow (live mode):
 *   JS tick → synth values
 *     ├─ session.record(channelId, {value}, wallT)   — writes to IDB
 *     └─ Float32 encode → pool.broadcastStream()     — live chart push via worker
 *
 * DVR mode: broadcastStream is paused; each SensorChart's useChartReplay
 * hook hydrates from IDB and streams onFrame events instead.
 *
 * Key difference from chart-replay.tsx:
 *   chart-replay.tsx  — one JS tick per chart (useChartReplayBridge), no worker pool
 *   worker-fan-out.tsx — one shared setInterval tick for all charts, pool.broadcastStream
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { createSineSynth, mulberry32 } from "@heojeongbo/fluxion-render/testing";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionWorkerPool,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import {
  MetricChannel,
  type MetricSample,
  type ReplaySession,
} from "@heojeongbo/fluxion-replay";
import {
  useChartLiveBackfill,
  useChartReplay,
  useLiveTimeRange,
  useRecordingSession,
  useReplayDvr,
  type UseReplayDvrResult,
  useReplayPlayer,
  useReplayScrubber,
  useReplaySession,
} from "@heojeongbo/fluxion-replay/react";

// ─── Layout ────────────────────────────────────────────────────────────────

const CHART_COUNT = 16;
const COLS = 4;
const ROWS = Math.ceil(CHART_COUNT / COLS);
const SAMPLE_HZ = 60;
const INTERVAL_MS = 1000 / SAMPLE_HZ;
const TIME_WINDOW_MS = 5_000;
const MAX_HZ = SAMPLE_HZ;

// ─── Theme (matches other replay demos) ───────────────────────────────────

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

const LIVE_EDGE_EPS_MS = 250;

// ─── Channels ──────────────────────────────────────────────────────────────
// Module-scope so identity is stable across renders.

const CHANNELS: MetricChannel[] = Array.from(
  { length: CHART_COUNT },
  (_, i) => new MetricChannel(`sensor-${i}`),
);

const SESSION_OPTS = {
  channels: CHANNELS,
  retentionMs: 5 * 60_000,
};

// ─── Noise ─────────────────────────────────────────────────────────────────

const noise = mulberry32(0xdeadbeef);

// ─── Button style helper ───────────────────────────────────────────────────

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

// ─── SensorChart ───────────────────────────────────────────────────────────

interface SensorChartProps {
  index: number;
  timeOrigin: number;
  isLive: boolean;
  dvr: UseReplayDvrResult;
  session: ReplaySession | null;
  pool: ReturnType<typeof useFluxionWorkerPool>;
  onReady: (host: FluxionHost) => void;
}

function SensorChart({
  index,
  timeOrigin,
  isLive,
  dvr,
  session,
  pool,
  onReady,
}: SensorChartProps) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const color = COLORS[index % COLORS.length]!;
  const channel = CHANNELS[index]!;

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: TIME_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        showXGrid: true,
        showYGrid: true,
        showXLabels: false,
        showYLabels: false,
        gridColor: "rgba(80,90,110,0.18)",
        gridDashArray: [3, 3] as [number, number],
        axisColor: T.textMuted,
        yPadPx: 4,
      }),
      scatterLayer("line", {
        color,
        pointSize: 3,
        retentionMs: TIME_WINDOW_MS,
        maxHz: MAX_HZ,
      }),
    ],
    [timeOrigin, color],
  );

  // DVR path: hydrate trailing window from IDB + stream onFrame events
  useChartReplay<MetricSample>({
    host: isLive ? null : host,
    player: isLive ? null : dvr.player,
    store: isLive ? null : (session?.store ?? null),
    channel,
    layerId: "line",
    windowMs: TIME_WINDOW_MS,
    timeOrigin,
    pickValue: (d) => d.value,
  });

  // DVR→Live: wipe chart and refill with most recent window from IDB
  useChartLiveBackfill<MetricSample>({
    host,
    store: session?.store ?? null,
    channel,
    layerId: "line",
    windowMs: TIME_WINDOW_MS,
    timeOrigin,
    pickValue: (d) => d.value,
    active: isLive,
  });

  const handleReady = useCallback(
    (h: FluxionHost) => {
      setHost(h);
      onReady(h);
    },
    [onReady],
  );

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
        #{index + 1}
      </div>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        yAxisWidth={28}
        xAxisHeight={0}
        axisColor={T.textMuted}
        axisFont="8px sans-serif"
        axisTickSize={3}
        axisTickMargin={2}
        layers={layers}
        hostOptions={{ bgColor: "#0a0c12", pool }}
        onReady={handleReady}
      />
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function WorkerFanOutApp() {
  const { session, isReady, enterReplay, exitReplay } =
    useReplaySession(SESSION_OPTS);

  const timeOrigin = useTimeOrigin();
  const [rate, setRate] = useState(1.0);
  const [scrubT, setScrubT] = useState<number | null>(null);

  const { timeRange: liveTimeRange, seed: seedTimeRange } =
    useLiveTimeRange(session);

  // Start recording immediately when IDB is ready. Per-chart record() calls
  // happen inside the shared tick loop below (not via useChartReplayBridge).
  useRecordingSession({ session, enabled: isReady, seedTimeRange });

  const dvr = useReplayDvr({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange,
    rate,
    autoPlay: false,
  });

  const pool = useFluxionWorkerPool({
    size: 1,
    workerFactory: () =>
      new Worker(
        new URL("./pool-sensor-worker.ts", import.meta.url),
        { type: "module" },
      ),
  });

  const replayPlayer = useReplayPlayer(dvr.player);
  const isPlaying = replayPlayer.state === "playing";
  const isLive = !dvr.isDvr;

  // Keep isLive and session in refs so the setInterval closure stays fresh
  // without being recreated on every render.
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Track chart hosts so broadcastStream can address them by hostId
  const hostsRef = useRef<(FluxionHost | null)[]>(
    Array.from({ length: CHART_COUNT }, () => null),
  );

  // ── Shared tick loop ───────────────────────────────────────────────────
  // One interval drives all N charts. Each tick:
  //   1. Record decoded values to session (always — DVR playback needs them)
  //   2. Broadcast Float32 packet to worker for live chart rendering
  //      (skipped during DVR so stale live samples don't overwrite replay)
  useEffect(() => {
    const synths = Array.from({ length: CHART_COUNT }, (_, i) =>
      createSineSynth({
        freqHz: 0.4 + i * 0.15,
        amplitude: 0.8,
        seriesOffset: i * 0.5,
      }),
    );

    let lastT = 0;

    const id = setInterval(() => {
      const tEnd = Date.now() - timeOrigin;
      const tStart = lastT;
      lastT = tEnd;
      const t = tStart;           // relative ms (for synths + chart wire)
      const wallT = t + timeOrigin; // absolute ms (for session.record)

      // Collect only hosts that are registered in the current pool instance.
      // Stale hosts from a previous pool (StrictMode double-invoke) would
      // corrupt the ci↔buf index mapping in broadcastStream.
      const activeTargets: { hostId: string; layerId: string; idx: number }[] = [];
      for (let i = 0; i < CHART_COUNT; i++) {
        const host = hostsRef.current[i];
        if (host && pool.hasHost(host.hostId)) {
          activeTargets.push({ hostId: host.hostId, layerId: "line", idx: i });
        }
      }
      if (activeTargets.length === 0) return;

      // Compute synth values once — shared by both record() and broadcastStream
      const values = activeTargets.map(({ idx }) =>
        synths[idx]!(t) + idx * 0.2 + (noise() - 0.5) * 0.1,
      );

      // 1. Record to session (always — enables DVR playback of this data)
      const s = sessionRef.current;
      if (s) {
        for (let ci = 0; ci < activeTargets.length; ci++) {
          const { idx } = activeTargets[ci]!;
          s.record(
            `sensor-${idx}`,
            { name: `sensor-${idx}`, value: values[ci]! } satisfies MetricSample,
            wallT,
          );
        }
      }

      // 2. Broadcast raw packet to worker (live chart push)
      if (isLiveRef.current) {
        const buf = new Float32Array(1 + activeTargets.length);
        buf[0] = t * 1000; // ms → µs
        for (let ci = 0; ci < activeTargets.length; ci++) {
          buf[1 + ci] = values[ci]! * 32767; // [-1,1] → raw_i16 range
        }
        pool.broadcastStream(
          activeTargets.map(({ hostId, layerId }) => ({ hostId, layerId })),
          buf.buffer,
          buf.length,
        );
      }
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [pool, timeOrigin]);

  // ── Scrubber ───────────────────────────────────────────────────────────
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
    recordingStartMs: timeOrigin,
  });

  const onScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const range = dvr.effectiveTimeRange;
      if (!range) return;
      const t = Number(e.target.value);
      setScrubT(t);
      if (dvr.isDvr) {
        dvr.player?.seek(t);
      } else if (t < range.latest - LIVE_EDGE_EPS_MS) {
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
      if (t < range.latest - LIVE_EDGE_EPS_MS) {
        void dvr.enter(t).then(() => dvr.player?.play(rate));
      }
    } else if (t >= (dvr.frozenLatest ?? range.latest) - LIVE_EDGE_EPS_MS) {
      dvr.exit();
    } else {
      dvr.player?.seek(t);
      dvr.player?.play(rate);
    }
  }, [dvr, scrubT, rate]);

  // ── Render ─────────────────────────────────────────────────────────────
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
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          worker fan-out · {CHART_COUNT} charts
        </span>
        <span style={{ color: T.textMuted, fontSize: 11 }}>
          1 pool · 1 worker · 1 postMessage/tick · {SAMPLE_HZ}Hz · {TIME_WINDOW_MS / 1000}s window
        </span>

        {/* DVR badge */}
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
            {new Date(replayPlayer.currentT).toLocaleTimeString("en-US", {
              hour12: false,
            })}
          </span>
        )}

        <div
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}
        >
          {!isReady && (
            <span style={{ color: T.textMuted, fontSize: 11 }}>Opening IDB…</span>
          )}
          {isReady && isLive && (
            <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>● REC</span>
          )}
          {!isLive && (
            <>
              <button
                onClick={() =>
                  isPlaying ? dvr.player?.pause() : dvr.player?.play(rate)
                }
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
        {Array.from({ length: CHART_COUNT }, (_, i) => (
          <SensorChart
            key={i}
            index={i}
            timeOrigin={timeOrigin}
            isLive={isLive}
            dvr={dvr}
            session={session}
            pool={pool}
            onReady={(host) => {
              hostsRef.current[i] = host;
            }}
          />
        ))}
      </div>

      {/* Timeline scrubber */}
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
            <span>
              {new Date(scrubMin).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span style={{ color: isLive ? T.red : T.text }}>
              {isLive ? "● LIVE · " : ""}
              {new Date(scrubValue).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <span>
              {new Date(scrubMax).toLocaleTimeString("en-US", { hour12: false })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
