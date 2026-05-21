import { useCallback, useEffect, useRef, useState } from "react";
import {
  LogChannel,
  MetricChannel,
  VideoChannel,
  VideoRecorder,
  VideoReplayer,
  type ReplayPlayerFrame,
} from "@heojeongbo/fluxion-replay";
import {
  ReplayTimeline,
  useReplayPlayer,
  useReplaySession,
  useReplayTimeline,
} from "@heojeongbo/fluxion-replay/react";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_CHANNEL_ID = "screen";
const CPU_CHANNEL_ID = "cpu";
const MEM_CHANNEL_ID = "memory";
const LOG_CHANNEL_ID = "system";
const LOG2_CHANNEL_ID = "events";

const CHANNELS = [
  new VideoChannel(VIDEO_CHANNEL_ID),
  new MetricChannel(CPU_CHANNEL_ID),
  new MetricChannel(MEM_CHANNEL_ID),
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
  accentHover: "#6ba3ff",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
} as const;

function formatMs(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

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
    transition: "opacity 0.15s",
  };
}

// ─── Metric sparkline ─────────────────────────────────────────────────────────

function Sparkline({
  values,
  color,
  label,
}: {
  values: number[];
  color: string;
  label: string;
}) {
  const w = 200;
  const h = 48;
  const max = 100;
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(" ");

  const latest = values[values.length - 1] ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: T.textSub }}>{label}</span>
        <span style={{ color, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {latest.toFixed(1)}%
        </span>
      </div>
      <svg width={w} height={h} style={{ display: "block" }}>
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

interface MetricSample {
  name: string;
  value: number;
}
interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
}
interface LiveLogEntry {
  t: number;
  channel: string;
  level: string;
  message: string;
}

export function App() {
  const { session, isReady, mode, enterReplay, exitReplay, record } =
    useReplaySession(SESSION_OPTS);

  // ── Live recording state ─────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const videoRecorderRef = useRef<VideoRecorder | null>(null);
  const metricIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [recElapsedSec, setRecElapsedSec] = useState(0);
  const recTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Replay state ──────────────────────────────────────────────────────────
  const [player, setPlayer] =
    useState<ReturnType<typeof useReplayPlayer>["player"]>(null);
  const [timeRange, setTimeRange] = useState<{ earliest: number; latest: number } | null>(
    null,
  );
  const [rate, setRate] = useState(1.0);
  const [replayLogs, setReplayLogs] = useState<ReplayPlayerFrame[]>([]);
  const replayCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoReplayerRef = useRef<VideoReplayer | null>(null);

  const replayPlayer = useReplayPlayer(player);
  const timeline = useReplayTimeline(player, timeRange);

  const isPlaying = replayPlayer.state === "playing";
  const elapsed = replayPlayer.currentT - (timeRange?.earliest ?? 0);
  const total = (timeRange?.latest ?? 0) - (timeRange?.earliest ?? 0);

  // ── Start screen capture + recording ─────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!isReady || !session) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;

      // Show live preview
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No video track");

      await session.startRecording();

      // Start VideoRecorder
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
      await vr.start(videoTrack);

      // Start metric simulation
      metricIntervalRef.current = setInterval(() => {
        const cpu = +(30 + Math.random() * 50).toFixed(1);
        const mem = +(40 + Math.random() * 30).toFixed(1);
        record(CPU_CHANNEL_ID, { name: "cpu", value: cpu } as MetricSample);
        record(MEM_CHANNEL_ID, { name: "memory", value: mem } as MetricSample);
        setCpuHistory((h) => [...h.slice(-39), cpu]);
        setMemHistory((h) => [...h.slice(-39), mem]);

        if (Math.random() < 0.06) {
          const levels = ["info", "warn", "error"] as const;
          const sysMessages = [
            "CPU spike detected",
            "Memory pressure: GC triggered",
            "Disk I/O latency high",
            "Network interface reset",
            "Thermal throttling active",
          ];
          record(LOG_CHANNEL_ID, {
            level: levels[Math.floor(Math.random() * levels.length)],
            message: sysMessages[Math.floor(Math.random() * sysMessages.length)],
          } as LogEntry);
        }
        if (Math.random() < 0.06) {
          const levels = ["info", "warn", "error"] as const;
          const appMessages = [
            "User interaction captured",
            "Frame dropped: buffer overflow",
            "Stream reconnected",
            "Codec negotiation complete",
            "Keyframe requested",
          ];
          record(LOG2_CHANNEL_ID, {
            level: levels[Math.floor(Math.random() * levels.length)],
            message: appMessages[Math.floor(Math.random() * appMessages.length)],
          } as LogEntry);
        }
      }, 200);

      // Start log ticker (2s interval — guaranteed log every tick)
      logIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const useSystem = Math.random() < 0.5;
        const channelId = useSystem ? LOG_CHANNEL_ID : LOG2_CHANNEL_ID;
        const LEVELS = ["info", "info", "warn", "error"] as const;
        const level = LEVELS[Math.floor(Math.random() * LEVELS.length)];
        const msgs = useSystem ? SYSTEM_MSGS : APP_MSGS;
        const message = msgs[Math.floor(Math.random() * msgs.length)];
        record(channelId, { level, message } as LogEntry);
        setLiveLogs((prev) => [...prev.slice(-49), { t: now, channel: channelId, level, message }]);
      }, 2000);

      // Start elapsed time ticker
      const startMs = Date.now();
      setRecElapsedSec(0);
      recTickRef.current = setInterval(() => {
        setRecElapsedSec(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);

      // Auto-stop when user closes screen share
      videoTrack.addEventListener(
        "ended",
        () => {
          void stopRecording();
        },
        { once: true },
      );

      setIsRecording(true);
    } catch (e) {
      if ((e as Error).name !== "NotAllowedError") console.error(e);
    }
  }, [isReady, session, record]);

  const stopRecording = useCallback(async () => {
    if (metricIntervalRef.current) {
      clearInterval(metricIntervalRef.current);
      metricIntervalRef.current = null;
    }
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
    if (recTickRef.current) {
      clearInterval(recTickRef.current);
      recTickRef.current = null;
    }
    setRecElapsedSec(0);
    setLiveLogs([]);
    videoRecorderRef.current?.stop();
    videoRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    session?.stopRecording();
    setIsRecording(false);
  }, [session]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      void stopRecording();
    },
    [stopRecording],
  );

  // ── Enter replay ──────────────────────────────────────────────────────────
  const handleEnterReplay = useCallback(async () => {
    if (!session) return;
    const range = await session.getTimeRange();
    if (!range) {
      alert("No recorded data yet. Record for a few seconds first.");
      return;
    }

    // Pause live recording display but keep session
    if (liveVideoRef.current) liveVideoRef.current.pause();

    setTimeRange(range);
    setReplayLogs([]);

    const p = await enterReplay(range.earliest);
    setPlayer(p);

    // Connect VideoReplayer to replay canvas
    if (replayCanvasRef.current) {
      videoReplayerRef.current?.dispose();
      videoReplayerRef.current = new VideoReplayer({
        channelId: VIDEO_CHANNEL_ID,
        store: session.store,
        outputCanvas: replayCanvasRef.current,
        decoderConfig: { codec: "vp8", codedWidth: 1280, codedHeight: 720 },
      });
    }

    p?.onFrame((frame) => {
      // Video frames → VideoReplayer
      if (frame.channelId === VIDEO_CHANNEL_ID) {
        videoReplayerRef.current?.feedFrame(frame);
        return;
      }
      // Other frames → log panel
      setReplayLogs((prev) => [...prev.slice(-99), frame]);
    });
  }, [session, enterReplay]);

  const handleExitReplay = useCallback(() => {
    player?.stop();
    videoReplayerRef.current?.dispose();
    videoReplayerRef.current = null;
    setPlayer(null);
    setTimeRange(null);
    setReplayLogs([]);
    if (liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      void liveVideoRef.current.play();
    }
    exitReplay();
  }, [player, exitReplay]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: T.bg,
        color: T.text,
        fontFamily: "-apple-system, system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {/* ── Top bar ── */}
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
        <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>
          fluxion-replay
        </span>
        <span style={{ color: T.textMuted, fontSize: 11 }}>
          WebCodecs · OPFS · IndexedDB · VirtualClock
        </span>

        <div
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}
        >
          {!isReady && (
            <span style={{ color: T.textMuted, fontSize: 11 }}>Opening IndexedDB…</span>
          )}

          {/* Live controls */}
          {mode === "live" && isReady && !isRecording && (
            <>
              <button
                onClick={async () => {
                  await session?.clearRecording();
                  setCpuHistory([]);
                  setMemHistory([]);
                  setLiveLogs([]);
                  setRecElapsedSec(0);
                }}
                style={btn(false)}
              >
                ↺ Clear
              </button>
              <button onClick={startRecording} style={btn(true)}>
                ⏺ Start Recording
              </button>
            </>
          )}
          {mode === "live" && isRecording && (
            <>
              <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>● REC</span>
              <span
                style={{
                  color: T.textSub,
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 44,
                }}
              >
                {formatMs(recElapsedSec * 1000)}
              </span>
              <span style={{ color: T.textMuted, fontSize: 10 }}>/ 10:00 max</span>
              <button onClick={() => void stopRecording()} style={btn(false, true)}>
                Stop
              </button>
              <button onClick={() => void handleEnterReplay()} style={btn(true)}>
                ▶ Replay
              </button>
            </>
          )}

          {/* Replay controls */}
          {mode === "replay" && (
            <>
              <button
                onClick={() => (isPlaying ? player?.pause() : player?.play(rate))}
                style={btn(true)}
              >
                {isPlaying ? "⏸" : "▶"} {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                onClick={() => {
                  player?.stop();
                  player?.play(rate);
                }}
                style={btn(false)}
              >
                ⏮
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
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  color: T.textSub,
                  fontSize: 11,
                  minWidth: 80,
                  textAlign: "right",
                }}
              >
                {formatMs(elapsed)} / {formatMs(total)}
              </span>
              <button onClick={handleExitReplay} style={btn(false, true)}>
                ✕ Exit
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Timeline (replay mode only) ── */}
      {mode === "replay" && timeRange && (
        <div
          style={{
            padding: "0 16px",
            background: T.panel,
            borderBottom: `1px solid ${T.border}`,
            flexShrink: 0,
          }}
        >
          <ReplayTimeline
            timeline={timeline}
            formatTime={(t, earliest) => {
              const wall = new Date(t).toLocaleTimeString("en-US", { hour12: false });
              const rel = formatMs(t - earliest);
              return `${wall} (+${rel})`;
            }}
            style={{ padding: "8px 0" }}
          />
        </div>
      )}

      {/* ── Main split view ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* ── Left: Live ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: `1px solid ${T.border}`,
          }}
        >
          <SectionHeader
            label="LIVE"
            dot={isRecording ? T.red : T.textMuted}
            dotBlink={isRecording}
          />

          {/* Video preview */}
          <div
            style={{
              flex: "0 0 auto",
              aspectRatio: "16/9",
              background: "#000",
              position: "relative",
              maxHeight: "50%",
            }}
          >
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
            {!isRecording && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: T.textMuted,
                }}
              >
                <div style={{ fontSize: 40 }}>🖥</div>
                <div style={{ fontSize: 12 }}>
                  Click "Start Recording" to begin screen capture
                </div>
              </div>
            )}
          </div>

          {/* Metrics */}
          <div
            style={{
              flex: "0 0 auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {isRecording ? (
              <>
                <Sparkline values={cpuHistory} color={T.accent} label="CPU %" />
                <Sparkline values={memHistory} color={T.green} label="Memory %" />
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
                  Recording metrics via{" "}
                  <code style={{ color: T.textSub }}>MetricChannel</code> + video via{" "}
                  <code style={{ color: T.textSub }}>VideoChannel (WebCodecs)</code>
                </div>
              </>
            ) : (
              <div
                style={{
                  color: T.textMuted,
                  fontSize: 12,
                  textAlign: "center",
                  marginTop: 24,
                }}
              >
                {isReady
                  ? "Press Start Recording to capture screen and metrics."
                  : "Initializing…"}
              </div>
            )}
          </div>

          {/* Live log panel */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderTop: `1px solid ${T.border}` }}>
            <div
              style={{
                padding: "4px 12px",
                fontSize: 10,
                color: T.textMuted,
                borderBottom: `1px solid ${T.border}`,
                background: T.panel,
                flexShrink: 0,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span>LIVE LOGS</span>
              <span style={{ color: T.yellow }}>■ system</span>
              <span style={{ color: "#c084fc" }}>■ events</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
              {!isRecording && (
                <div style={{ color: T.textMuted, padding: "12px 16px" }}>
                  Start recording to see live logs…
                </div>
              )}
              {isRecording && liveLogs.length === 0 && (
                <div style={{ color: T.textMuted, padding: "12px 16px" }}>
                  No logs yet…
                </div>
              )}
              {[...liveLogs].reverse().map((log, i) => (
                <LiveLogRow key={i} log={log} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Replay ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <SectionHeader
            label="REPLAY"
            dot={isPlaying ? T.green : T.textMuted}
            extra={
              mode === "replay" ? (
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: isPlaying
                      ? "rgba(74,222,128,0.15)"
                      : "rgba(255,255,255,0.05)",
                    color: isPlaying ? T.green : T.textMuted,
                  }}
                >
                  {replayPlayer.state}
                </span>
              ) : undefined
            }
          />

          {/* Replay canvas */}
          <div
            style={{
              flex: "0 0 auto",
              aspectRatio: "16/9",
              background: "#000",
              position: "relative",
              maxHeight: "50%",
            }}
          >
            <canvas
              ref={replayCanvasRef}
              width={1280}
              height={720}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
            {mode !== "replay" && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: T.textMuted,
                }}
              >
                <div style={{ fontSize: 40 }}>⏪</div>
                <div style={{ fontSize: 12 }}>
                  Record first, then press "Replay" to time-travel
                </div>
              </div>
            )}
          </div>

          {/* Frame log */}
          <div
            style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
          >
            <div
              style={{
                padding: "4px 12px",
                fontSize: 10,
                color: T.textMuted,
                borderBottom: `1px solid ${T.border}`,
                background: T.panel,
                flexShrink: 0,
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span>DECODED FRAMES</span>
              <span style={{ color: T.yellow }}>■ system</span>
              <span style={{ color: "#c084fc" }}>■ events</span>
              <span style={{ color: T.accent }}>■ cpu</span>
              <span style={{ color: T.green }}>■ memory</span>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: 11,
              }}
            >
              {mode !== "replay" && (
                <div style={{ color: T.textMuted, padding: "12px 16px" }}>
                  Waiting for replay…
                </div>
              )}
              {mode === "replay" && replayLogs.length === 0 && (
                <div style={{ color: T.textMuted, padding: "12px 16px" }}>
                  Press Play to decode frames…
                </div>
              )}
              {[...replayLogs].reverse().map((f, i) => (
                <FrameRow key={i} frame={f} earliest={timeRange?.earliest ?? 0} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderBottom: `1px solid ${T.border}`,
        background: T.panel,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dot,
          flexShrink: 0,
          animation: dotBlink ? "pulse 1.2s ease-in-out infinite" : undefined,
        }}
      />
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: T.textSub,
        }}
      >
        {label}
      </span>
      {extra}
    </div>
  );
}

function LiveLogRow({ log }: { log: LiveLogEntry }) {
  const channelColor = log.channel === LOG_CHANNEL_ID ? T.yellow : "#c084fc";
  const textColor = log.level === "error" ? T.red : log.level === "warn" ? T.yellow : T.text;
  const wall = new Date(log.t).toLocaleTimeString("en-US", { hour12: false });
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "2px 12px",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <span style={{ color: T.textSub, minWidth: 72, fontVariantNumeric: "tabular-nums" }}>
        {wall}
      </span>
      <span style={{ color: channelColor, minWidth: 52, fontWeight: 600 }}>
        {log.channel}
      </span>
      <span
        style={{
          color: textColor,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {log.message}
      </span>
    </div>
  );
}

function FrameRow({ frame, earliest }: { frame: ReplayPlayerFrame; earliest: number }) {
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
  const textColor =
    logLevel === "error" ? T.red : logLevel === "warn" ? T.yellow : T.text;

  const wall = new Date(frame.t).toLocaleTimeString("en-US", { hour12: false });
  const rel = formatMs(frame.t - earliest);

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "2px 12px",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <span
        style={{
          color: T.textSub,
          minWidth: 72,
          fontVariantNumeric: "tabular-nums",
          fontSize: 11,
        }}
      >
        {wall}
      </span>
      <span
        style={{
          color: T.textMuted,
          minWidth: 42,
          fontVariantNumeric: "tabular-nums",
          fontSize: 10,
        }}
      >
        +{rel}
      </span>
      <span style={{ color: channelColor, minWidth: 52, fontWeight: 600 }}>
        {frame.channelId}
      </span>
      <span
        style={{
          color: textColor,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {JSON.stringify(frame.data)}
      </span>
    </div>
  );
}
