/**
 * Worker Fan-Out Replay Demo
 *
 * Combines the stream-worker-demo pattern (broadcastStream → 1 worker →
 * N chart engines) with the DVR replay system.
 *
 * Data flow (live mode, 500 Hz via 50 Hz batched ticks):
 *   JS tick → K=10 synth values per channel (2 ms apart)
 *     ├─ session.record(channelId, {value}, wallT) ×K — writes to IDB
 *     └─ Float32 batch encode → pool.broadcastStream() — one packet/tick via worker
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
// 500 Hz per channel, delivered in batches: tick at 50 Hz, pack 10 samples per
// channel into ONE broadcastStream packet (keeps the "1 postMessage/tick"
// property). A naive 2 ms interval would jitter under browser timer clamping.
const BATCH_HZ = 50;
const SAMPLES_PER_BATCH = 10;
const SAMPLE_HZ = BATCH_HZ * SAMPLES_PER_BATCH; // 500 (≈ 10 samples per 20 ms tick)
const INTERVAL_MS = 1000 / BATCH_HZ;
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
        // Live: the x-axis scrolls with wall-clock time so the chart keeps
        // moving even when stream data pauses. Toggled with isLive via the
        // effect below (DVR follows the player's seek position instead).
        followClock: true,
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

  // Toggle wall-clock following with live/DVR. useFluxionCanvas only applies
  // layer config at mount, so flip it explicitly here: live → axis scrolls
  // with the clock; DVR → axis follows the player's seek position (latestT).
  useEffect(() => {
    host?.configLayer("axis", { followClock: isLive });
  }, [host, isLive]);

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
  // `startRecording()` runs asynchronously, so gate the loop on `isRecording`
  // (below) — otherwise early ticks call session.record() while the recorder
  // is still `_recording === false` and the frames are silently dropped, so
  // IDB never advances and the scrubber's live-edge time label stays frozen.
  const { isRecording } = useRecordingSession({
    session,
    enabled: isReady,
    seedTimeRange,
  });

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
  // Gate the record loop on the recorder actually being started (see above).
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

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

    // Previous tick's end, in relative ms. Starts at 0 so the FIRST recorded
    // sample is anchored exactly at timeOrigin — never before it. Each tick's
    // K samples fill (lastT, tEnd], keeping the recorded timeline strictly
    // increasing and contiguous (the recorder/DVR assume monotonic t; backward
    // or pre-origin timestamps corrupt getTimeRange and break DVR entry).
    let lastT = 0;

    const id = setInterval(() => {
      const tEnd = Date.now() - timeOrigin;
      // Guard the mount-time degenerate interval where tEnd hasn't advanced past
      // lastT yet — emitting then would produce a zero-width/backward window.
      if (tEnd <= lastT) return;
      const tStart = lastT;
      lastT = tEnd;

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

      const nCh = activeTargets.length;
      const K = SAMPLES_PER_BATCH;
      // Spread K samples evenly across the real elapsed window (tStart, tEnd].
      const step = (tEnd - tStart) / K;

      // Compute K synth values per channel (once) — shared by record() + broadcast.
      // values[ci][i] = channel ci, sub-sample i. relTs[i] = relative ms.
      const relTs = new Array<number>(K);
      const values: number[][] = activeTargets.map(() => new Array<number>(K));
      for (let i = 0; i < K; i++) {
        const tRel = tStart + (i + 1) * step; // (tStart, tEnd], strictly increasing
        relTs[i] = tRel;
        for (let ci = 0; ci < nCh; ci++) {
          const { idx } = activeTargets[ci]!;
          values[ci]![i] = synths[idx]!(tRel) + idx * 0.2 + (noise() - 0.5) * 0.1;
        }
      }

      // 1. Record every sub-sample to session (only once recording has actually
      // started — else recorder.record() silently drops the frames).
      const s = sessionRef.current;
      if (s && isRecordingRef.current) {
        for (let ci = 0; ci < nCh; ci++) {
          const { idx } = activeTargets[ci]!;
          for (let i = 0; i < K; i++) {
            s.record(
              `sensor-${idx}`,
              { name: `sensor-${idx}`, value: values[ci]![i]! } satisfies MetricSample,
              relTs[i]! + timeOrigin, // absolute wall ms
            );
          }
        }
      }

      // 2. Broadcast ONE batched packet to the worker (live chart push).
      // Layout: [K, t0_µs..t(K-1)_µs, ch0_v0..v(K-1), ch1_v0.., ...]
      if (isLiveRef.current) {
        const buf = new Float32Array(1 + K + K * nCh);
        buf[0] = K;
        for (let i = 0; i < K; i++) buf[1 + i] = relTs[i]! * 1000; // ms → µs
        const valuesBase = 1 + K;
        for (let ci = 0; ci < nCh; ci++) {
          const base = valuesBase + ci * K;
          for (let i = 0; i < K; i++) {
            buf[base + i] = values[ci]![i]! * 32767; // [-1,1] → raw_i16 range
          }
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

  // Force a full IDB flush once per second. At 500 Hz × 16 channels (8000
  // frames/s) the store's default timer flush (≤200 frames / 500 ms = 400/s)
  // can't keep up, so the IDB time range — and the scrubber's live-edge label —
  // fell ever further behind real time and looked frozen. The public flush()
  // drains the ENTIRE pending queue, so a 1 Hz call persists all recorded
  // frames and keeps `getTimeRange().latest` (the scrubber max) tracking now.
  useEffect(() => {
    if (!session || !isReady) return;
    const id = setInterval(() => {
      void session.store.flush();
    }, 1000);
    return () => clearInterval(id);
  }, [session, isReady]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-app-bg text-app-text font-sans text-[13px]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel shrink-0 h-11">
        <span className="font-bold text-[13px]">
          worker fan-out · {CHART_COUNT} charts
        </span>
        <span className="text-app-muted text-[11px]">
          1 pool · 1 worker · 1 postMessage/tick · {SAMPLE_HZ}Hz (batch{" "}
          {SAMPLES_PER_BATCH}×{BATCH_HZ}Hz) · {TIME_WINDOW_MS / 1000}s window
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
