import { useCallback, useEffect, useMemo, useState } from "react";
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import { MetricChannel, type MetricSample } from "@heojeongbo/fluxion-replay";
import {
  useChartReplay,
  useReplayPlayer,
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
// Deterministic sine + small noise. Each chart gets a different phase/freq so
// the grid visually shows distinct waveforms.

function sampleAt(tMs: number, freqHz: number, offset: number): number {
  const seconds = tMs / 1000;
  const carrier = Math.sin(seconds * 2 * Math.PI * freqHz + offset) * 0.8;
  const noise = (Math.random() - 0.5) * 0.05;
  return carrier + noise;
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
const RING_CAPACITY = Math.ceil((WINDOW_MS / 1000) * HZ * 1.5);

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
  isRecording: boolean;
  player: ReturnType<typeof useReplayPlayer>["player"];
  store: import("@heojeongbo/fluxion-replay").ReplayStore | null;
  record: (channelId: string, data: MetricSample, t?: number) => void;
  /** Shared origin so the chart's Float32 wire format doesn't quantise samples. */
  timeOrigin: number;
}

function MiniChart({
  spec,
  isLive,
  isRecording,
  player,
  store,
  record,
  timeOrigin,
}: MiniChartProps) {
  const [host, setHost] = useState<FluxionHost | null>(null);

  // Time axis: host-relative ms anchored at `timeOrigin` so the chart wire
  // format stays inside Float32's safe range. `axisGridLayer.timeOrigin`
  // re-adds the offset for wall-clock labels.
  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        showXGrid: true,
        showYGrid: true,
        showXLabels: false,
        showYLabels: false,
        gridColor: "rgba(80,90,110,0.18)",
        gridDashArray: [3, 3],
        axisColor: T.textMuted,
        yPadPx: 6,
      }),
      lineLayer("line", { color: spec.color, lineWidth: 1.25, capacity: RING_CAPACITY }),
    ],
    [spec.color, timeOrigin],
  );

  // LIVE: 20Hz pump per chart. Push host-relative t to the chart, but store
  // the absolute wall-clock t in the session so DVR seek queries stay sane.
  useFluxionStream({
    host: isLive && isRecording ? host : null,
    intervalMs: 1000 / HZ,
    setup: (h) => h.line("line"),
    tick: (_t, handle) => {
      const wallT = Date.now();
      const y = sampleAt(wallT, spec.freqHz, spec.offset);
      handle.push({ t: wallT - timeOrigin, y });
      record(spec.id, { name: spec.id, value: y }, wallT);
      return 1;
    },
  });

  // REPLAY: bridge the same chart to the player. The hook re-applies the same
  // timeOrigin shift to backfill + onFrame pushes.
  useChartReplay<MetricSample>({
    host: isLive ? null : host,
    player: isLive ? null : player,
    store: isLive ? null : store,
    channel: spec.channel,
    layerId: "line",
    windowMs: WINDOW_MS,
    timeOrigin,
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

export function ChartReplayApp() {
  const { session, isReady, mode, enterReplay, exitReplay, record } =
    useReplaySession(SESSION_OPTS);

  // Shared timeOrigin across every chart on the page. Established once at
  // mount; the chart wire pushes `t - timeOrigin` to dodge Float32 quantisation
  // around `Date.now()` (≈1.78e12 → ~131,072ms bucket size).
  const timeOrigin = useMemo(() => Date.now(), []);

  const [isRecording, setIsRecording] = useState(false);
  const [player, setPlayer] =
    useState<ReturnType<typeof useReplayPlayer>["player"]>(null);
  const [timeRange, setTimeRange] = useState<{ earliest: number; latest: number } | null>(null);
  const [rate, setRate] = useState(1.0);
  const [scrubT, setScrubT] = useState<number | null>(null);

  const replayPlayer = useReplayPlayer(player);
  const isPlaying = replayPlayer.state === "playing";
  const isLive = mode === "live";

  // ── Recording ─────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!session) return;
    await session.startRecording();
    setIsRecording(true);
  }, [session]);

  const stopRecording = useCallback(() => {
    session?.stopRecording();
    setIsRecording(false);
  }, [session]);

  // ── DVR ───────────────────────────────────────────────────────────────────
  const handleEnterReplay = useCallback(async () => {
    if (!session) return;
    const range = await session.getTimeRange();
    if (!range || range.latest - range.earliest < 1000) {
      alert("Record for at least 1s before entering DVR.");
      return;
    }
    setTimeRange(range);
    // Land the cursor where the last WINDOW_MS of samples are visible.
    const startT = Math.max(range.earliest, range.latest - WINDOW_MS);
    const p = await enterReplay(startT);
    setPlayer(p);
  }, [session, enterReplay]);

  const handleExitReplay = useCallback(() => {
    player?.stop();
    setPlayer(null);
    setTimeRange(null);
    setScrubT(null);
    exitReplay();
  }, [player, exitReplay]);

  useEffect(
    () => () => {
      if (isRecording) session?.stopRecording();
      player?.dispose();
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: unmount cleanup
    [],
  );

  // ── Scrubber ──────────────────────────────────────────────────────────────
  const scrubMin = timeRange?.earliest ?? 0;
  const scrubMax = timeRange?.latest ?? 0;
  const scrubValue = scrubT ?? (mode === "replay" ? replayPlayer.currentT : 0);

  const onScrubChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = Number(e.target.value);
      setScrubT(t);
      player?.seek(t);
    },
    [player],
  );
  const onScrubRelease = useCallback(() => setScrubT(null), []);

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

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!isReady && <span style={{ color: T.textMuted, fontSize: 11 }}>Opening IDB…</span>}

          {isLive && (
            <>
              {isRecording ? (
                <>
                  <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>● REC</span>
                  <button onClick={stopRecording} style={btn(false, true)}>■ Stop</button>
                  <button onClick={() => void handleEnterReplay()} style={btn(true)}>
                    ⏪ Enter DVR
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={async () => { await session?.clearRecording(); }}
                    style={btn(false)}
                  >
                    ↺ Clear
                  </button>
                  <button onClick={() => void startRecording()} style={btn(true)}>
                    ⏺ Start Recording
                  </button>
                </>
              )}
            </>
          )}

          {!isLive && (
            <>
              <button
                onClick={() => (isPlaying ? player?.pause() : player?.play(rate))}
                style={btn(true)}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play"}
              </button>
              {([0.5, 1, 2, 4] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRate(r);
                    if (isPlaying) player?.play(r);
                  }}
                  style={btn(rate === r)}
                >
                  {r}×
                </button>
              ))}
              <button onClick={handleExitReplay} style={btn(false, true)}>
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
            isRecording={isRecording}
            player={player}
            store={session?.store ?? null}
            record={record}
            timeOrigin={timeOrigin}
          />
        ))}
      </div>

      {/* Scrubber (DVR only) */}
      {!isLive && timeRange && (
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
            step={50}
            value={scrubValue}
            onChange={onScrubChange}
            onMouseUp={onScrubRelease}
            onTouchEnd={onScrubRelease}
            style={{ width: "100%", accentColor: T.accent, cursor: "pointer" }}
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
            <span style={{ color: T.text }}>
              {new Date(scrubValue).toLocaleTimeString("en-US", { hour12: false })}.
              {String(Math.floor(scrubValue % 1000)).padStart(3, "0")}
            </span>
            <span>{new Date(scrubMax).toLocaleTimeString("en-US", { hour12: false })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
