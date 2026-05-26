import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LogChannel,
  MetricChannel,
  VideoChannel,
  VideoRecorder,
  snapTimeToSegment,
  type ReplayPlayerFrame,
} from "@heojeongbo/fluxion-replay";
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  FluxionCanvas,
  axisGridLayer,
  lineLayer,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import {
  useChartReplayBridge,
  useDisplayMedia,
  useLiveTimeRange,
  useReplayDvr,
  useReplayPlayer,
  useReplaySession,
  useReplayTimeline,
  useRecordingSession,
  useStorageInfo,
  useVideoReplayer,
  type RecordingSegment,
} from "@heojeongbo/fluxion-replay/react";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_CHANNEL_ID = "screen";
const CPU_CHANNEL_ID = "cpu";
const MEM_CHANNEL_ID = "memory";
const LOG_CHANNEL_ID = "system";
const LOG2_CHANNEL_ID = "events";

const CPU_CHANNEL = new MetricChannel(CPU_CHANNEL_ID);
const MEM_CHANNEL = new MetricChannel(MEM_CHANNEL_ID);

const CHANNELS = [
  new VideoChannel(VIDEO_CHANNEL_ID),
  CPU_CHANNEL,
  MEM_CHANNEL,
  new LogChannel(LOG_CHANNEL_ID),
  new LogChannel(LOG2_CHANNEL_ID),
];

const SESSION_OPTS = { channels: CHANNELS, retentionMs: 10 * 60_000 };

const SYSTEM_MSGS = [
  "CPU spike detected",
  "Memory pressure: GC triggered",
  "Disk I/O latency high",
  "Network interface reset",
  "Thermal throttling active",
  "Swap usage elevated",
  "Kernel OOM killer invoked",
];
const APP_MSGS = [
  "User interaction captured",
  "Frame dropped: buffer overflow",
  "Stream reconnected",
  "Codec negotiation complete",
  "Keyframe requested",
  "Pipeline stall detected",
  "Encoder queue flushed",
];

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
  green: "#4ade80",
  yellow: "#fbbf24",
  live: "#f87171",
} as const;

function formatMs(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function btn(active: boolean, danger = false, highlight = false): React.CSSProperties {
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
    transition: "opacity 0.15s",
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricSample { name: string; value: number; }
interface LogEntry { level: "info" | "warn" | "error"; message: string; }
interface LiveLogEntry { t: number; channel: string; level: string; message: string; }

// ─── MiniChart ────────────────────────────────────────────────────────────────

const MINI_COLORS = ["#4fc3f7", "#80ffa0", "#ffb060", "#f48fb1", "#ce93d8", "#80cbc4", "#ffcc02", "#ef9a9a"];

function MiniChart({ index }: { index: number }) {
  const color = MINI_COLORS[index % MINI_COLORS.length]!;
  const freqHz = 0.3 + (index % 7) * 0.25;
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 8_000,
        timeOrigin,
        yMode: "auto",
        showXLabels: true,
        showYLabels: false,
      }),
      lineLayer("line", { color, lineWidth: 1.5, capacity: 1024 }),
    ],
    [timeOrigin, color],
  );

  useFluxionStream({
    host,
    intervalMs: 1000 / 20,
    setup: (h) => h.line("line"),
    tick: (t, handle) => {
      const y = Math.sin(2 * Math.PI * freqHz * t / 1000) + (Math.random() - 0.5) * 0.3;
      handle.push({ t, y });
      return 1;
    },
  });

  return (
    <div style={{
      position: "relative", minWidth: 0, minHeight: 0,
      background: T.panel, border: `1px solid ${T.border}`,
      borderRadius: 3, overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 3, left: 5,
        fontSize: 8, color: T.textMuted, pointerEvents: "none", zIndex: 1,
      }}>
        #{index + 1}
      </div>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        yAxisWidth={0}
        xAxisHeight={16}
        axisFont="8px system-ui"
        axisColor={T.textMuted}
        layers={layers}
        hostOptions={{ bgColor: T.bg }}
        onReady={setHost}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

// ─── DVR App ──────────────────────────────────────────────────────────────────

export function DvrApp() {
  const { session, isReady, enterReplay, exitReplay } = useReplaySession(SESSION_OPTS);

  // ── Display media / video capture ─────────────────────────────────────────
  const { stream, start: startCapture, stop: stopCapture } = useDisplayMedia();
  const videoRecorderRef = useRef<VideoRecorder | null>(null);

  // ── Live time range ────────────────────────────────────────────────────────
  const { timeRange, segments, seed: seedTimeRange } = useLiveTimeRange(session);
  const storageInfo = useStorageInfo(session, { intervalMs: 3000 });

  // ── Elapsed REC timer ──────────────────────────────────────────────────────
  const [recElapsedSec, setRecElapsedSec] = useState(0);
  const recTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── DVR logs (right panel) ─────────────────────────────────────────────────
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const [dvrLogs, setDvrLogs] = useState<ReplayPlayerFrame[]>([]);
  const [rightTab, setRightTab] = useState<"logs" | "charts">("logs");

  // ── Playback rate ──────────────────────────────────────────────────────────
  const [rate, setRate] = useState(1.0);

  // ── Recording session — spins up once stream exists ───────────────────────
  const setLiveLogsRef = useRef(setLiveLogs);
  setLiveLogsRef.current = setLiveLogs;

  const { isRecording } = useRecordingSession({
    session,
    enabled: isReady && !!stream,
    clearOnStart: false,
    seedTimeRange,
    channels: [
      {
        channelId: LOG_CHANNEL_ID,
        intervalMs: 2000,
        produce: (wallT: number) => {
          const level = (["info", "info", "warn", "error"] as const)[Math.floor(Math.random() * 4)]!;
          const message = SYSTEM_MSGS[Math.floor(Math.random() * SYSTEM_MSGS.length)]!;
          setLiveLogsRef.current((prev) => [...prev.slice(-49), { t: wallT, channel: LOG_CHANNEL_ID, level, message }]);
          return { level, message } as LogEntry;
        },
      },
      {
        channelId: LOG2_CHANNEL_ID,
        intervalMs: 2000,
        produce: (wallT: number) => {
          const level = (["info", "info", "warn", "error"] as const)[Math.floor(Math.random() * 4)]!;
          const message = APP_MSGS[Math.floor(Math.random() * APP_MSGS.length)]!;
          setLiveLogsRef.current((prev) => [...prev.slice(-49), { t: wallT, channel: LOG2_CHANNEL_ID, level, message }]);
          return { level, message } as LogEntry;
        },
      },
    ],
  });

  // ── VideoRecorder: start/stop alongside isRecording ───────────────────────
  useEffect(() => {
    if (!isRecording || !stream || !session) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const startMs = Date.now();
    setRecElapsedSec(0);
    recTickRef.current = setInterval(() => setRecElapsedSec(Math.floor((Date.now() - startMs) / 1000)), 1000);

    const vr = new VideoRecorder({
      channelId: VIDEO_CHANNEL_ID,
      store: session.store,
      recorder: session.recorder,
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      framerate: 30,
    });
    videoRecorderRef.current = vr;
    void vr.start(track).catch((e) => console.warn("[DVR] VideoRecorder failed:", e));

    return () => {
      clearInterval(recTickRef.current ?? undefined);
      recTickRef.current = null;
      vr.stop();
      videoRecorderRef.current = null;
      setRecElapsedSec(0);
    };
  }, [isRecording, stream, session]);

  // ── Start capture (user gesture required) ─────────────────────────────────
  const handleStartCapture = useCallback(async () => {
    try {
      await startCapture({ video: { frameRate: 30 } as MediaTrackConstraints, audio: false });
    } catch (e) {
      if ((e as Error).name !== "NotAllowedError") console.error("[DVR] startCapture failed:", e);
    }
  }, [startCapture]);

  const handleStopCapture = useCallback(() => {
    stopCapture();
    setLiveLogs([]);
  }, [stopCapture]);

  // ── DVR controller ─────────────────────────────────────────────────────────
  const dvr = useReplayDvr({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange: timeRange,
    autoPlay: true,
    autoExitToLive: true,
    rate,
  });

  // ── Video refs ─────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = stream;
      if (stream) void liveVideoRef.current.play();
    }
  }, [stream]);

  // ── Video replay ───────────────────────────────────────────────────────────
  useVideoReplayer(dvr.isDvr ? dvr.player : null, canvasRef, session?.store ?? null, VIDEO_CHANNEL_ID);

  // ── Chart ──────────────────────────────────────────────────────────────────
  const [chartHost, setChartHost] = useState<FluxionHost | null>(null);
  const tOrigin = useMemo(() => Date.now(), []);

  const chartLayers = useMemo(() => [
    axisGridLayer("axis", { xMode: "time", timeWindowMs: 30_000, timeOrigin: tOrigin }),
    lineLayer(CPU_CHANNEL_ID, { color: T.accent, lineWidth: 1.5, retentionMs: 600_000, maxHz: 5 }),
    lineLayer(MEM_CHANNEL_ID, { color: T.green, lineWidth: 1.5, retentionMs: 600_000, maxHz: 5 }),
  ], [tOrigin]);

  useChartReplayBridge<MetricSample>({
    host: chartHost,
    session,
    dvr,
    isLive: !dvr.isDvr,
    channel: CPU_CHANNEL,
    layerId: CPU_CHANNEL_ID,
    windowMs: 30_000,
    liveHz: 5,
    timeOrigin: tOrigin,
    produce: () => ({ name: "cpu", value: +(30 + Math.random() * 50).toFixed(1) }),
    pickValue: (d) => d.value,
  });

  useChartReplayBridge<MetricSample>({
    host: chartHost,
    session,
    dvr,
    isLive: !dvr.isDvr,
    channel: MEM_CHANNEL,
    layerId: MEM_CHANNEL_ID,
    windowMs: 30_000,
    liveHz: 5,
    timeOrigin: tOrigin,
    produce: () => ({ name: "memory", value: +(40 + Math.random() * 30).toFixed(1) }),
    pickValue: (d) => d.value,
  });

  // ── DVR log frames ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dvr.player) { setDvrLogs([]); return; }
    return dvr.player.onFrame((frame) => {
      if (frame.channelId === VIDEO_CHANNEL_ID) return;
      setDvrLogs((prev) => [...prev.slice(-99), frame]);
    });
  }, [dvr.player]);

  // ── Timeline / scrubber ────────────────────────────────────────────────────
  const replayPlayer = useReplayPlayer(dvr.player);
  const timeline = useReplayTimeline(dvr.player, dvr.effectiveTimeRange);
  const isPlaying = replayPlayer.state === "playing";

  const handleSeek = useCallback((fraction: number) => {
    if (!timeRange) return;
    const effectiveLatest = dvr.effectiveTimeRange?.latest ?? timeRange.latest;
    const raw = timeRange.earliest + fraction * (effectiveLatest - timeRange.earliest);
    const t = snapTimeToSegment(raw, segments, effectiveLatest);
    if (fraction >= 0.9999) {
      dvr.exit();
    } else {
      void dvr.enter(t);
    }
  }, [dvr, timeRange, segments]);

  // ── Derived display lists ──────────────────────────────────────────────────
  const reversedLiveLogs = useMemo(() => [...liveLogs].reverse(), [liveLogs]);
  const reversedDvrLogs = useMemo(() => [...dvrLogs].reverse(), [dvrLogs]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const { isDvr, frozenLatest } = dvr;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
      background: T.bg, color: T.text, fontFamily: "-apple-system, system-ui, sans-serif", fontSize: 13,
    }}>
      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "8px 16px", borderBottom: `1px solid ${T.border}`,
        background: T.panel, flexShrink: 0, height: 44,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>fluxion-replay</span>
        <span style={{ color: T.textMuted, fontSize: 11 }}>DVR · WebCodecs · OPFS · IndexedDB</span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!isReady && <span style={{ color: T.textMuted, fontSize: 11 }}>Opening IndexedDB…</span>}

          {/* Pre-recording */}
          {isReady && !isRecording && !stream && (
            <>
              <button onClick={async () => { dvr.exit(); await session?.clearRecording(); }} style={btn(false)}>↺ Clear</button>
              <button onClick={() => void handleStartCapture()} style={btn(true)}>⏺ Start Recording</button>
            </>
          )}

          {/* REC indicator */}
          {isRecording && (
            <>
              <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>● REC</span>
              <span style={{ color: T.textSub, fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 44 }}>
                {formatMs(recElapsedSec * 1000)}
              </span>
              <span style={{ color: T.textMuted, fontSize: 10 }}>/ 10:00 max</span>
            </>
          )}

          {/* DVR playback controls */}
          {isDvr && (
            <>
              <div style={{ width: 1, height: 16, background: T.border, margin: "0 4px" }} />
              <button onClick={() => (isPlaying ? dvr.player?.pause() : dvr.player?.play(rate))} style={btn(true)}>
                {isPlaying ? "⏸" : "▶"} {isPlaying ? "Pause" : "Play"}
              </button>
              <button onClick={() => { dvr.player?.stop(); dvr.player?.play(rate); }} style={btn(false)}>⏮</button>
              {([0.5, 1, 2, 4] as const).map((r) => (
                <button key={r} onClick={() => { setRate(r); if (isPlaying) dvr.player?.play(r); }} style={btn(rate === r)}>
                  {r}×
                </button>
              ))}
              {isRecording && (
                <span style={{ fontVariantNumeric: "tabular-nums", color: T.yellow, fontSize: 11, minWidth: 80 }}>
                  -{formatMs(Date.now() - replayPlayer.currentT)} behind
                </span>
              )}
              {isRecording && (
                <button onClick={dvr.exit} style={{
                  padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                  fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
                  border: "none", background: T.red, color: "#fff",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ fontSize: 8 }}>●</span> LIVE
                </button>
              )}
              {!isRecording && (
                <button onClick={handleStopCapture} style={btn(false, true)}>■ Stop</button>
              )}
            </>
          )}

          {/* Stop button in live mode */}
          {isRecording && !isDvr && (
            <button onClick={handleStopCapture} style={btn(false, true)}>■ Stop</button>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* ── Video / canvas area ── */}
        <div style={{ flex: "0 0 auto", width: "60%", display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}`, minHeight: 0, overflow: "hidden" }}>
          {/* Video/canvas */}
          <div style={{ flex: "0 0 auto", aspectRatio: "16/9", background: "#000", position: "relative", maxHeight: "50%", overflow: "hidden" }}>
            <video
              ref={liveVideoRef}
              autoPlay muted playsInline
              style={{
                width: "100%", height: "100%", objectFit: "contain", display: "block",
                position: "absolute", inset: 0,
                opacity: isDvr ? 0 : 1,
                transition: "opacity 0.2s",
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "100%",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                opacity: isDvr ? 1 : 0,
                transition: "opacity 0.2s",
              }}
            />
            {!isRecording && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 12, color: T.textMuted,
              }}>
                <div style={{ fontSize: 40 }}>🖥</div>
                <div style={{ fontSize: 12 }}>Click "Start Recording" to begin</div>
              </div>
            )}
            {isRecording && !isDvr && (
              <div style={{
                position: "absolute", top: 8, left: 8,
                background: "rgba(248,113,113,0.18)", border: `1px solid ${T.red}`,
                borderRadius: 4,
                padding: "2px 8px", fontSize: 10, fontWeight: 700, color: T.red,
                display: "flex", alignItems: "center", gap: 4, letterSpacing: "0.08em",
              }}>
                <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>●</span> LIVE
              </div>
            )}
          </div>

          {/* Metrics + live logs */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Metrics chart — always mounted, hidden until recording starts */}
            <div style={{
              flex: "0 0 auto", height: 90,
              borderBottom: `1px solid ${T.border}`,
              position: "relative",
              display: (isRecording || isDvr) ? "block" : "none",
            }}>
              <FluxionCanvas
                layers={chartLayers}
                axisLayerId="axis"
                yAxisWidth={36}
                xAxisHeight={18}
                hostOptions={{ bgColor: T.bg }}
                axisColor={T.textMuted}
                axisFont="10px system-ui"
                onReady={setChartHost}
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            {/* Live logs */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div style={{
                padding: "3px 12px", fontSize: 10, color: T.textMuted,
                borderBottom: `1px solid ${T.border}`, background: T.panel,
                flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
              }}>
                <span>LIVE LOGS</span>
                <span style={{ color: T.yellow }}>■ system</span>
                <span style={{ color: "#c084fc" }}>■ events</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
                {!isRecording
                  ? <div style={{ color: T.textMuted, padding: "10px 12px" }}>Start recording to see live logs…</div>
                  : liveLogs.length === 0
                    ? <div style={{ color: T.textMuted, padding: "10px 12px" }}>No logs yet…</div>
                    : reversedLiveLogs.map((log, i) => <LiveLogRow key={i} log={log} />)
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Tabs (Logs / Charts) ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {/* Tab header */}
          <div style={{
            padding: "0 12px", fontSize: 10,
            borderBottom: `1px solid ${T.border}`, background: T.panel,
            flexShrink: 0, display: "flex", alignItems: "stretch", gap: 0,
          }}>
            {(["logs", "charts"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "5px 10px", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
                  color: rightTab === tab ? T.accent : T.textMuted,
                  borderBottom: rightTab === tab ? `2px solid ${T.accent}` : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {tab.toUpperCase()}
              </button>
            ))}
            {rightTab === "logs" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
                <span style={{ color: T.yellow }}>■ system</span>
                <span style={{ color: "#c084fc" }}>■ events</span>
                <span style={{ color: T.accent }}>■ cpu</span>
                <span style={{ color: T.green }}>■ memory</span>
              </div>
            )}
          </div>

          {/* Logs tab */}
          <div style={{
            flex: 1, overflowY: "auto", fontFamily: "monospace", fontSize: 11,
            display: rightTab === "logs" ? "block" : "none",
          }}>
            {!isDvr
              ? <div style={{ color: T.textMuted, padding: "12px 16px" }}>
                  {isRecording ? "Drag the timeline to time-travel…" : "Start recording first."}
                </div>
              : dvrLogs.length === 0
                ? <div style={{ color: T.textMuted, padding: "12px 16px" }}>Press Play to decode frames…</div>
                : reversedDvrLogs.map((f, i) => (
                    <FrameRow key={i} frame={f} earliest={timeRange?.earliest ?? 0} />
                  ))
            }
          </div>

          {/* Charts tab — always mounted so stream data is retained across tab switches */}
          <div style={{
            flex: 1, minHeight: 0,
            display: rightTab === "charts" ? "grid" : "none",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "repeat(5, 1fr)",
            gap: 3, padding: 6,
            background: T.bg,
            overflow: "hidden",
          }}>
            {Array.from({ length: 20 }, (_, i) => <MiniChart key={i} index={i} />)}
          </div>
        </div>
      </div>

      {/* ── Timeline bar ── */}
      {(isRecording || timeRange) && (
        <div style={{
          flexShrink: 0, background: T.panel,
          borderTop: `1px solid ${T.border}`,
          padding: "6px 16px 8px",
          overflow: "hidden",
        }}>
          {/* Storage capacity bar */}
          <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: storageInfo ? `${Math.min(100, storageInfo.percentUsed)}%` : "0%",
                background: storageInfo
                  ? (storageInfo.percentUsed > 80 ? T.red : storageInfo.percentUsed > 50 ? T.yellow : T.accent)
                  : T.accent,
                transition: "width 0.5s ease",
              }} />
            </div>
            <span style={{ color: T.textMuted, fontSize: 9, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexShrink: 0, textAlign: "right" }}>
              {storageInfo
                ? `${formatBytes(storageInfo.usedBytes)} / ${formatBytes(storageInfo.quotaBytes)} (${storageInfo.percentUsed.toFixed(1)}%)`
                : "Storage: --"}
            </span>
          </div>

          {/* Time labels */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: T.textMuted, marginBottom: 2 }}>
            <span>{timeRange ? new Date(timeRange.earliest).toLocaleTimeString("en-US", { hour12: false }) : "--:--:--"}</span>
            {isDvr && isRecording ? (
              <button onClick={dvr.exit} style={{
                padding: "2px 8px", borderRadius: 12, cursor: "pointer",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                border: `1px solid ${T.red}`, background: "rgba(248,113,113,0.15)",
                color: T.red, display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ fontSize: 7 }}>●</span> LIVE
              </button>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {isRecording && <span style={{ color: T.red, fontSize: 9 }}>●</span>}
                {timeRange
                  ? new Date(isDvr && frozenLatest != null ? frozenLatest : timeRange.latest)
                      .toLocaleTimeString("en-US", { hour12: false })
                  : "--:--:--"}
                {isRecording && <span style={{ color: T.textMuted, fontSize: 9, marginLeft: 2 }}>LIVE</span>}
              </span>
            )}
          </div>

          {/* Unified scrubber */}
          <UnifiedScrubber
            isDvr={isDvr}
            dvrFraction={timeline.fraction}
            disabled={!timeRange}
            onSeek={handleSeek}
            segments={segments}
            earliest={timeRange?.earliest ?? 0}
            latest={isDvr && frozenLatest != null ? frozenLatest : (timeRange?.latest ?? 0)}
          />
        </div>
      )}
    </div>
  );
}

// ─── UnifiedScrubber ──────────────────────────────────────────────────────────

function UnifiedScrubber({
  isDvr,
  dvrFraction,
  disabled,
  onSeek,
  segments,
  earliest,
  latest,
}: {
  isDvr: boolean;
  dvrFraction: number;
  disabled: boolean;
  onSeek: (fraction: number) => void;
  segments: RecordingSegment[];
  earliest: number;
  latest: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!isDvr || isDraggingRef.current || !inputRef.current) return;
    inputRef.current.value = String(Math.round(dvrFraction * 10_000));
  }, [isDvr, dvrFraction]);

  useEffect(() => {
    if (!isDvr && inputRef.current) {
      inputRef.current.value = "10000";
    }
  }, [isDvr]);

  const duration = latest - earliest;

  return (
    <div style={{ position: "relative", padding: "2px 0" }}>
      {/* Segment track overlay */}
      <div style={{
        position: "absolute", left: 0, right: 0,
        top: "50%", transform: "translateY(-50%)",
        height: 4, background: T.border, borderRadius: 2, pointerEvents: "none",
      }}>
        {duration > 0 && segments.map((seg, i) => {
          const segEnd = seg.end ?? latest;
          const left = ((seg.start - earliest) / duration) * 100;
          const width = ((Math.min(segEnd, latest) - seg.start) / duration) * 100;
          if (width <= 0) return null;
          return (
            <div key={i} style={{
              position: "absolute",
              left: `${left}%`,
              width: `${width}%`,
              height: "100%",
              background: isDvr ? T.accent : T.red,
              borderRadius: 2,
            }} />
          );
        })}
      </div>
      <input
        ref={inputRef}
        type="range"
        min={0} max={10_000} step={1}
        defaultValue={10_000}
        disabled={disabled}
        onPointerDown={() => { isDraggingRef.current = true; }}
        onPointerUp={(e) => {
          isDraggingRef.current = false;
          const f = Number((e.currentTarget as HTMLInputElement).value) / 10_000;
          onSeek(f);
        }}
        style={{
          position: "relative", width: "100%",
          accentColor: isDvr ? T.accent : T.red,
          cursor: disabled ? "default" : "pointer",
          background: "transparent",
        }}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveLogRow({ log }: { log: LiveLogEntry }) {
  const channelColor = log.channel === LOG_CHANNEL_ID ? T.yellow : "#c084fc";
  const textColor = log.level === "error" ? T.red : log.level === "warn" ? T.yellow : T.text;
  const wall = new Date(log.t).toLocaleTimeString("en-US", { hour12: false });
  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 12px", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.textSub, minWidth: 68, fontVariantNumeric: "tabular-nums" }}>{wall}</span>
      <span style={{ color: channelColor, minWidth: 48, fontWeight: 600 }}>{log.channel}</span>
      <span style={{ color: textColor, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {log.message}
      </span>
    </div>
  );
}

function FrameRow({ frame, earliest }: { frame: ReplayPlayerFrame; earliest: number }) {
  const channelColor =
    frame.channelId === LOG_CHANNEL_ID ? T.yellow
    : frame.channelId === LOG2_CHANNEL_ID ? "#c084fc"
    : frame.channelId === CPU_CHANNEL_ID ? T.accent
    : T.green;
  const data = frame.data as Record<string, unknown>;
  const logLevel = data.level as string | undefined;
  const textColor = logLevel === "error" ? T.red : logLevel === "warn" ? T.yellow : T.text;
  const wall = new Date(frame.t).toLocaleTimeString("en-US", { hour12: false });
  const rel = formatMs(frame.t - earliest);
  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 12px", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ color: T.textSub, minWidth: 68, fontVariantNumeric: "tabular-nums", fontSize: 11 }}>{wall}</span>
      <span style={{ color: T.textMuted, minWidth: 38, fontVariantNumeric: "tabular-nums", fontSize: 10 }}>+{rel}</span>
      <span style={{ color: channelColor, minWidth: 48, fontWeight: 600 }}>{frame.channelId}</span>
      <span style={{ color: textColor, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {JSON.stringify(frame.data)}
      </span>
    </div>
  );
}
