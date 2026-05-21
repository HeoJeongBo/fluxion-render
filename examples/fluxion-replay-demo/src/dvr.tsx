import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  LogChannel,
  MetricChannel,
  VideoChannel,
  VideoRecorder,
  VideoReplayer,
  type ReplayPlayerFrame,
} from "@heojeongbo/fluxion-replay";
import {
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
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  live: "#f87171",
} as const;

function formatMs(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const w = 160; const h = 36; const max = 100;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");
  const latest = values[values.length - 1] ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: T.textSub, fontSize: 10, minWidth: 52 }}>{label}</span>
      <svg width={w} height={h} style={{ display: "block", flex: "0 0 auto" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <span style={{ color, fontSize: 11, fontVariantNumeric: "tabular-nums", fontWeight: 600, minWidth: 36 }}>
        {latest.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── DVR App ──────────────────────────────────────────────────────────────────

export function DvrApp() {
  const { session, isReady, enterReplay, exitReplay, record } = useReplaySession(SESSION_OPTS);

  // ── Recording state ────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<VideoRecorder | null>(null);
  const metricIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recElapsedSec, setRecElapsedSec] = useState(0);
  const [metrics, dispatchMetrics] = useReducer(
    (state: { cpu: number[]; mem: number[] }, action: { cpu: number; mem: number } | "reset") =>
      action === "reset"
        ? { cpu: [], mem: [] }
        : { cpu: [...state.cpu.slice(-39), action.cpu], mem: [...state.mem.slice(-39), action.mem] },
    { cpu: [], mem: [] },
  );
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);

  // ── DVR / player state ────────────────────────────────────────────────────
  // isDvr: true = time-travel mode, false = live edge
  const [isDvr, setIsDvr] = useState(false);
  const [player, setPlayer] = useState<ReturnType<typeof useReplayPlayer>["player"]>(null);
  const [timeRange, setTimeRange] = useState<{ earliest: number; latest: number } | null>(null);
  const [rate, setRate] = useState(1.0);
  const [dvrLogs, setDvrLogs] = useState<ReplayPlayerFrame[]>([]);

  // live edge tracking: update timeRange every second while recording
  const liveRangeTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // live video element (shown in live mode)
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const videoReplayerRef = useRef<VideoReplayer | null>(null);

  const replayPlayer = useReplayPlayer(player);
  const timeline = useReplayTimeline(player, timeRange);

  const isPlaying = replayPlayer.state === "playing";
  const elapsed = replayPlayer.currentT - (timeRange?.earliest ?? 0);
  const total = (timeRange?.latest ?? 0) - (timeRange?.earliest ?? 0);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!isReady || !session) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        void liveVideoRef.current.play();
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No video track");

      await session.startRecording();
      // Immediately seed timeRange so the scrubber is enabled from the first frame
      const startNow = Date.now();
      setTimeRange({ earliest: startNow, latest: startNow });

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
      try {
        await vr.start(videoTrack);
      } catch (videoErr) {
        console.warn("[DVR] VideoRecorder failed to start (WebCodecs may be unavailable):", videoErr);
        // Continue without video recording — metric/log channels still work
      }

      // Metric simulation (200ms) — batched into single dispatch
      metricIntervalRef.current = setInterval(() => {
        const cpu = +(30 + Math.random() * 50).toFixed(1);
        const mem = +(40 + Math.random() * 30).toFixed(1);
        record(CPU_CHANNEL_ID, { name: "cpu", value: cpu } as MetricSample);
        record(MEM_CHANNEL_ID, { name: "memory", value: mem } as MetricSample);
        dispatchMetrics({ cpu, mem });
      }, 200);

      // Log ticker (2s) — guaranteed log entry
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

      // Elapsed time ticker
      const startMs = Date.now();
      setRecElapsedSec(0);
      recTickRef.current = setInterval(() => {
        setRecElapsedSec(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);

      // Live timeRange tracker — keeps timeline bar up to date while recording
      const pollRange = async () => {
        try {
          const range = await session.getTimeRange();
          if (range) setTimeRange(range);
        } catch {
          // Store may not be open yet or session was replaced — ignore
        }
      };
      void pollRange();
      liveRangeTickRef.current = setInterval(pollRange, 500);

      videoTrack.addEventListener("ended", () => { void stopRecording(); }, { once: true });
      setIsRecording(true);
    } catch (e) {
      const err = e as Error;
      if (err.name !== "NotAllowedError") {
        console.error("[DVR] startRecording failed:", err);
      }
    }
  }, [isReady, session, record]);

  const stopRecording = useCallback(async () => {
    clearInterval(metricIntervalRef.current ?? undefined);
    clearInterval(logIntervalRef.current ?? undefined);
    clearInterval(recTickRef.current ?? undefined);
    clearInterval(liveRangeTickRef.current ?? undefined);
    metricIntervalRef.current = null;
    logIntervalRef.current = null;
    recTickRef.current = null;
    liveRangeTickRef.current = null;
    setRecElapsedSec(0);
    setLiveLogs([]);
    videoRecorderRef.current?.stop();
    videoRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    session?.stopRecording();
    setIsRecording(false);
    setIsDvr(false);
  }, [session]);

  useEffect(() => () => { void stopRecording(); }, [stopRecording]);

  // ── Enter DVR (time-travel) mode ───────────────────────────────────────────
  const enterDvr = useCallback(async (seekT?: number) => {
    if (!session) return;
    const range = timeRange ?? { earliest: Date.now() - 60_000, latest: Date.now() };

    // Pause live video
    liveVideoRef.current?.pause();

    setDvrLogs([]);
    const p = await enterReplay(seekT ?? range.earliest);
    setPlayer(p);

    if (canvasRef.current) {
      videoReplayerRef.current?.dispose();
      videoReplayerRef.current = new VideoReplayer({
        channelId: VIDEO_CHANNEL_ID,
        store: session.store,
        outputCanvas: canvasRef.current,
        decoderConfig: { codec: "vp8", codedWidth: 1280, codedHeight: 720 },
      });
    }

    p?.onFrame((frame) => {
      if (frame.channelId === VIDEO_CHANNEL_ID) {
        videoReplayerRef.current?.feedFrame(frame);
        return;
      }
      setDvrLogs((prev) => [...prev.slice(-99), frame]);
    });

    setIsDvr(true);
  }, [session, timeRange, enterReplay]);

  // ── Return to live edge ────────────────────────────────────────────────────
  const goLive = useCallback(() => {
    player?.stop();
    videoReplayerRef.current?.dispose();
    videoReplayerRef.current = null;
    setPlayer(null);
    setDvrLogs([]);
    exitReplay();
    setIsDvr(false);

    // Resume live video
    if (liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      void liveVideoRef.current.play();
    }
  }, [player, exitReplay]);

  // ── Timeline scrub: entering DVR automatically ─────────────────────────────
  const handleSeek = useCallback((fraction: number) => {
    if (!timeRange) return;
    const t = timeRange.earliest + fraction * (timeRange.latest - timeRange.earliest);
    if (!isDvr) {
      void enterDvr(t);
    } else {
      replayPlayer.seek(t);
    }
  }, [isDvr, timeRange, enterDvr, replayPlayer]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden",
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
          {isReady && !isRecording && (
            <>
              <button onClick={async () => {
                await session?.clearRecording();
                dispatchMetrics("reset");
                setLiveLogs([]);
                setTimeRange(null);
              }} style={btn(false)}>↺ Clear</button>
              <button onClick={() => void startRecording()} style={btn(true)}>⏺ Start Recording</button>
            </>
          )}

          {/* Recording + live mode */}
          {isRecording && !isDvr && (
            <>
              <span style={{ color: T.red, fontSize: 11, fontWeight: 600 }}>● REC</span>
              <span style={{ color: T.textSub, fontSize: 11, fontVariantNumeric: "tabular-nums", minWidth: 44 }}>
                {formatMs(recElapsedSec * 1000)}
              </span>
              <span style={{ color: T.textMuted, fontSize: 10 }}>/ 10:00 max</span>
              <button onClick={() => void stopRecording()} style={btn(false, true)}>■ Stop</button>
            </>
          )}

          {/* DVR / time-travel mode */}
          {isDvr && (
            <>
              <span style={{ color: T.textMuted, fontSize: 11 }}>TIME-TRAVEL</span>
              <button onClick={() => (isPlaying ? player?.pause() : player?.play(rate))} style={btn(true)}>
                {isPlaying ? "⏸" : "▶"} {isPlaying ? "Pause" : "Play"}
              </button>
              <button onClick={() => { player?.stop(); player?.play(rate); }} style={btn(false)}>⏮</button>
              {([0.5, 1, 2, 4] as const).map((r) => (
                <button key={r} onClick={() => { setRate(r); if (isPlaying) player?.play(r); }} style={btn(rate === r)}>
                  {r}×
                </button>
              ))}
              <span style={{ fontVariantNumeric: "tabular-nums", color: T.textSub, fontSize: 11, minWidth: 80, textAlign: "right" }}>
                {formatMs(elapsed)} / {formatMs(total)}
              </span>
              {isRecording && (
                <button onClick={goLive} style={btn(false, false, true)}>▶ GO LIVE</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* ── Video / canvas area ── */}
        <div style={{ flex: "0 0 auto", width: "60%", display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}` }}>
          {/* Video/canvas */}
          <div style={{ flex: "0 0 auto", aspectRatio: "16/9", background: "#000", position: "relative", maxHeight: "55%" }}>
            {/* Live video — visible when not in DVR mode */}
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
            {/* Replay canvas — visible when in DVR mode */}
            <canvas
              ref={canvasRef}
              width={1280} height={720}
              style={{
                width: "100%", height: "100%", objectFit: "contain", display: "block",
                position: "absolute", inset: 0,
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
            {/* DVR badge */}
            {isDvr && (
              <div style={{
                position: "absolute", top: 8, left: 8,
                background: "rgba(0,0,0,0.7)", borderRadius: 4,
                padding: "2px 8px", fontSize: 10, fontWeight: 700, color: T.yellow,
                letterSpacing: "0.08em",
              }}>⏪ DVR</div>
            )}
            {/* LIVE badge */}
            {isRecording && !isDvr && (
              <div style={{
                position: "absolute", top: 8, left: 8,
                background: "rgba(0,0,0,0.7)", borderRadius: 4,
                padding: "2px 8px", fontSize: 10, fontWeight: 700, color: T.red,
                display: "flex", alignItems: "center", gap: 4, letterSpacing: "0.08em",
              }}>
                <span style={{ animation: "pulse 1.2s ease-in-out infinite" }}>●</span> LIVE
              </div>
            )}
          </div>

          {/* Metrics + live logs */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Metrics row */}
            <div style={{
              flex: "0 0 auto", padding: "10px 16px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {isRecording ? (
                <>
                  <Sparkline values={metrics.cpu} color={T.accent} label="CPU %" />
                  <Sparkline values={metrics.mem} color={T.green} label="Memory %" />
                </>
              ) : (
                <div style={{ color: T.textMuted, fontSize: 11 }}>
                  {isReady ? "Press Start Recording to capture screen and metrics." : "Initializing…"}
                </div>
              )}
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
                    : [...liveLogs].reverse().map((log, i) => <LiveLogRow key={i} log={log} />)
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: DVR log panel ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{
            padding: "3px 12px", fontSize: 10, color: T.textMuted,
            borderBottom: `1px solid ${T.border}`, background: T.panel,
            flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
          }}>
            <span>DVR FRAMES</span>
            <span style={{ color: T.yellow }}>■ system</span>
            <span style={{ color: "#c084fc" }}>■ events</span>
            <span style={{ color: T.accent }}>■ cpu</span>
            <span style={{ color: T.green }}>■ memory</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
            {!isDvr
              ? <div style={{ color: T.textMuted, padding: "12px 16px" }}>
                  {isRecording ? "Drag the timeline to time-travel…" : "Start recording first."}
                </div>
              : dvrLogs.length === 0
                ? <div style={{ color: T.textMuted, padding: "12px 16px" }}>Press Play to decode frames…</div>
                : [...dvrLogs].reverse().map((f, i) => (
                    <FrameRow key={i} frame={f} earliest={timeRange?.earliest ?? 0} />
                  ))
            }
          </div>
        </div>
      </div>

      {/* ── Timeline bar (always shown when recording or has data) ── */}
      {(isRecording || timeRange) && (
        <div style={{
          flexShrink: 0, background: T.panel,
          borderTop: `1px solid ${T.border}`,
          padding: "6px 16px 8px",
        }}>
          {/* Time labels */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted, marginBottom: 2 }}>
            <span>{timeRange ? new Date(timeRange.earliest).toLocaleTimeString("en-US", { hour12: false }) : "--:--:--"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {isRecording && !isDvr && <span style={{ color: T.red, fontSize: 9 }}>●</span>}
              {timeRange ? new Date(timeRange.latest).toLocaleTimeString("en-US", { hour12: false }) : "--:--:--"}
              {isRecording && <span style={{ color: T.textMuted, fontSize: 9, marginLeft: 2 }}>LIVE</span>}
            </span>
          </div>

          {/* Unified scrubber — stays mounted so drag is never interrupted */}
          <UnifiedScrubber
            isDvr={isDvr}
            dvrFraction={timeline.fraction}
            disabled={!timeRange}
            onSeek={handleSeek}
          />
        </div>
      )}
    </div>
  );
}

// ─── UnifiedScrubber ──────────────────────────────────────────────────────────
// Stays mounted in both live and DVR mode so drag is never interrupted by a
// component swap. In live mode it sits at the right edge; in DVR mode we push
// the DOM value to match the player's fraction on each render.

function UnifiedScrubber({
  isDvr,
  dvrFraction,
  disabled,
  onSeek,
}: {
  isDvr: boolean;
  dvrFraction: number;   // 0–1, only used while in DVR mode
  disabled: boolean;
  onSeek: (fraction: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);

  // While in DVR mode, keep the thumb position in sync with playback progress —
  // but not while the user is actively dragging (that would fight their input).
  useEffect(() => {
    if (!isDvr || isDraggingRef.current || !inputRef.current) return;
    inputRef.current.value = String(Math.round(dvrFraction * 10_000));
  }, [isDvr, dvrFraction]);

  // When returning to live mode, snap back to the right edge.
  useEffect(() => {
    if (!isDvr && inputRef.current) {
      inputRef.current.value = "10000";
    }
  }, [isDvr]);

  return (
    <div style={{ padding: "2px 0" }}>
      <input
        ref={inputRef}
        type="range"
        min={0} max={10_000} step={1}
        defaultValue={10_000}
        disabled={disabled}
        onMouseDown={() => { isDraggingRef.current = true; }}
        onTouchStart={() => { isDraggingRef.current = true; }}
        onMouseUp={() => { isDraggingRef.current = false; }}
        onTouchEnd={() => { isDraggingRef.current = false; }}
        onChange={(e) => {
          const f = Number(e.target.value) / 10_000;
          onSeek(f);
        }}
        style={{ width: "100%", accentColor: isDvr ? T.accent : T.red, cursor: disabled ? "default" : "pointer" }}
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
