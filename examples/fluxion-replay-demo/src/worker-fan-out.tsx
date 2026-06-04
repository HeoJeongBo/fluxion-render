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

import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionWorkerPool,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { createSineSynth, mulberry32 } from "@heojeongbo/fluxion-render/testing";
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
  useChartLiveBackfill,
  useChartReplay,
  useDvrController,
  useLiveTimeRange,
  useRecordingSession,
  useReplaySession,
} from "@heojeongbo/fluxion-replay/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { btn, T } from "./shared";

// ─── Layout ────────────────────────────────────────────────────────────────

const CHART_COUNT = 16;
const COLS = 4;
const ROWS = Math.ceil(CHART_COUNT / COLS);
const SAMPLE_HZ = 60;
const INTERVAL_MS = 1000 / SAMPLE_HZ;
const TIME_WINDOW_MS = 5_000;
const MAX_HZ = SAMPLE_HZ;

// (theme `T` + `btn` now live in ./shared)

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
    <div className="relative min-w-0 min-h-0 border border-app-border rounded overflow-hidden bg-[#0a0c12]">
      <div className="absolute top-[3px] left-[5px] text-[9px] text-app-muted pointer-events-none z-[1] tabular-nums">
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
  const { session, isReady, enterReplay, exitReplay } = useReplaySession(SESSION_OPTS);

  const timeOrigin = useTimeOrigin();

  const { timeRange: liveTimeRange, seed: seedTimeRange } = useLiveTimeRange(session);

  // Start recording immediately when IDB is ready. Per-chart record() calls
  // happen inside the shared tick loop below (not via useChartReplayBridge).
  useRecordingSession({ session, enabled: isReady, seedTimeRange });

  // One combined controller replaces the session→dvr→rate→player→scrubber chain.
  const ctl = useDvrController({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange,
    autoPlay: false,
    recordingStartMs: timeOrigin,
  });
  const { dvr, replayPlayer, isLive, isPlaying, rate, setRate } = ctl;

  const pool = useFluxionWorkerPool({
    size: 1,
    workerFactory: () =>
      new Worker(new URL("./pool-sensor-worker.ts", import.meta.url), { type: "module" }),
  });

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
      const t = tStart; // relative ms (for synths + chart wire)
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
      const values = activeTargets.map(
        ({ idx }) => synths[idx]!(t) + idx * 0.2 + (noise() - 0.5) * 0.1,
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

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-app-bg text-app-text font-sans text-[13px]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel shrink-0 h-11">
        <span className="font-bold text-[13px]">
          worker fan-out · {CHART_COUNT} charts
        </span>
        <span className="text-app-muted text-[11px]">
          1 pool · 1 worker · 1 postMessage/tick · {SAMPLE_HZ}Hz · {TIME_WINDOW_MS / 1000}
          s window
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
