import {
  createRandomLogProducer,
  formatMs,
  LogChannel,
  MetricChannel,
  VideoChannel,
} from "@heojeongbo/fluxion-replay";
import {
  PlaybackControls,
  ReplayTimeline,
  usePlaybackRate,
  useRecordingSession,
  useRecordingTimer,
  useReplayFrameLog,
  useReplayPlayer,
  useReplaySession,
  useReplayTimeline,
  useVideoRecorder,
  useVideoReplayer,
} from "@heojeongbo/fluxion-replay/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  APP_MSGS,
  btn,
  btnClass,
  CPU_CHANNEL_ID,
  FrameRow,
  type LiveLogEntry,
  LiveLogRow,
  LOG_CHANNEL_ID,
  LOG2_CHANNEL_ID,
  type LogEntry,
  MEM_CHANNEL_ID,
  type MetricSample,
  SectionHeader,
  SYSTEM_MSGS,
  T,
  VIDEO_CHANNEL_ID,
} from "./shared";

// ─── Channels & session ───────────────────────────────────────────────────────

const CHANNELS = [
  new VideoChannel(VIDEO_CHANNEL_ID),
  new MetricChannel(CPU_CHANNEL_ID),
  new MetricChannel(MEM_CHANNEL_ID),
  new LogChannel(LOG_CHANNEL_ID),
  new LogChannel(LOG2_CHANNEL_ID),
];
const SESSION_OPTS = { channels: CHANNELS, retentionMs: 10 * 60_000 };

// (theme `T`, `btn`/`btnClass`, sample messages, types, and the
// SectionHeader/LiveLogRow/FrameRow rows now live in ./shared; formatMs in the lib)

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    .map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  const latest = values[values.length - 1] ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-app-sub">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color }}>
          {latest.toFixed(1)}%
        </span>
      </div>
      <svg width={w} height={h} className="block">
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

// (SectionHeader / LiveLogRow / FrameRow now imported from ./shared)

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const { session, isReady, mode, enterReplay, exitReplay, record } =
    useReplaySession(SESSION_OPTS);

  // ── Stream + visual state ─────────────────────────────────────────────────
  const [stream, setStream] = useState<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = stream;
      if (stream) void liveVideoRef.current.play();
    }
  }, [stream]);

  // ── Metrics (sliding 40-point window) ─────────────────────────────────────
  const [metrics, dispatchMetrics] = useReducer(
    (s: { cpu: number[]; mem: number[] }, a: { cpu: number; mem: number } | "reset") =>
      a === "reset"
        ? { cpu: [], mem: [] }
        : { cpu: [...s.cpu.slice(-39), a.cpu], mem: [...s.mem.slice(-39), a.mem] },
    { cpu: [], mem: [] },
  );

  // ── Live log state ────────────────────────────────────────────────────────
  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const appendLiveLog = useRef(setLiveLogs);
  appendLiveLog.current = setLiveLogs;

  // ── Video-write error surface ─────────────────────────────────────────────
  const [writeError, setWriteError] = useState<string | null>(null);
  // Stable identity — onWriteError is in useVideoRecorder's effect deps, so an
  // inline arrow would re-create the recorder on every render.
  const handleVideoWriteError = useCallback(() => {
    setWriteError("Video write failed — storage may be full");
  }, []);

  // ── Recording session (manages start/stop, metric + log tickers) ──────────
  const { isRecording } = useRecordingSession({
    session,
    enabled: isReady && !!stream,
    channels: [
      {
        channelId: CPU_CHANNEL_ID,
        intervalMs: 200,
        // cpu metric + a paired memory metric + the sparkline reducer dispatch.
        produce: () => {
          const cpu = +(30 + Math.random() * 50).toFixed(1);
          const mem = +(40 + Math.random() * 30).toFixed(1);
          record(MEM_CHANNEL_ID, { name: "memory", value: mem } satisfies MetricSample);
          dispatchMetrics({ cpu, mem });
          return { name: "cpu", value: cpu } satisfies MetricSample;
        },
      },
      {
        channelId: LOG_CHANNEL_ID,
        intervalMs: 2000,
        produce: createRandomLogProducer({
          messages: SYSTEM_MSGS,
          onEmit: (e) =>
            appendLiveLog.current((prev) => [
              ...prev.slice(-49),
              { ...e, channel: LOG_CHANNEL_ID },
            ]),
        }) as (wallT: number) => LogEntry,
      },
      {
        channelId: LOG2_CHANNEL_ID,
        intervalMs: 2000,
        produce: createRandomLogProducer({
          messages: APP_MSGS,
          onEmit: (e) =>
            appendLiveLog.current((prev) => [
              ...prev.slice(-49),
              { ...e, channel: LOG2_CHANNEL_ID },
            ]),
        }) as (wallT: number) => LogEntry,
      },
    ],
  });

  // ── VideoRecorder + elapsed timer (library hooks) ─────────────────────────
  useVideoRecorder({
    channelId: VIDEO_CHANNEL_ID,
    session,
    isRecording,
    track: stream?.getVideoTracks()[0] ?? null,
    onWriteError: handleVideoWriteError,
  });
  const { elapsedSec } = useRecordingTimer({ isRecording });

  // ── Replay state ──────────────────────────────────────────────────────────
  const [player, setPlayer] =
    useState<ReturnType<typeof useReplayPlayer>["player"]>(null);
  const [timeRange, setTimeRange] = useState<{ earliest: number; latest: number } | null>(
    null,
  );
  const replayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Video frames paint to the canvas; non-video frames collect into the log —
  // both handled by library hooks, no manual VideoReplayer/onFrame wiring.
  useVideoReplayer(player, replayCanvasRef, session?.store ?? null, VIDEO_CHANNEL_ID);
  const replayLogs = useReplayFrameLog(player, { exclude: [VIDEO_CHANNEL_ID] });

  const replayPlayer = useReplayPlayer(player);
  const timeline = useReplayTimeline(player, timeRange);
  const isPlaying = replayPlayer.state === "playing";
  const elapsed = replayPlayer.currentT - (timeRange?.earliest ?? 0);
  const total = (timeRange?.latest ?? 0) - (timeRange?.earliest ?? 0);
  const { rate, setRate } = usePlaybackRate({ player });

  // ── Screen capture ────────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    setWriteError(null);
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      setStream(s);
      s.getVideoTracks()[0]?.addEventListener("ended", () => setStream(null), {
        once: true,
      });
    } catch (e) {
      if ((e as Error).name !== "NotAllowedError") console.error(e);
    }
  }, []);

  const stopCapture = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setLiveLogs([]);
    dispatchMetrics("reset");
  }, [stream]);

  // ── Replay ────────────────────────────────────────────────────────────────
  // useVideoReplayer + useReplayFrameLog (above) react to `player`, so entering
  // replay is just: grab the range, enter, and set the player.
  const handleEnterReplay = useCallback(async () => {
    if (!session) return;
    const range = await session.getTimeRange();
    if (!range) {
      alert("No recorded data yet. Record for a few seconds first.");
      return;
    }
    liveVideoRef.current?.pause();
    setTimeRange(range);
    setPlayer(await enterReplay(range.earliest));
  }, [session, enterReplay]);

  const handleExitReplay = useCallback(() => {
    player?.stop();
    setPlayer(null);
    setTimeRange(null);
    if (liveVideoRef.current && stream) {
      liveVideoRef.current.srcObject = stream;
      void liveVideoRef.current.play();
    }
    exitReplay();
  }, [player, stream, exitReplay]);

  const reversedLiveLogs = useMemo(() => [...liveLogs].reverse(), [liveLogs]);
  const reversedReplayLogs = useMemo(() => [...replayLogs].reverse(), [replayLogs]);

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-app-bg text-app-text font-sans text-[13px]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel shrink-0 h-11">
        <span className="font-bold text-[13px]">fluxion-replay</span>
        <span className="text-app-muted text-[11px]">
          WebCodecs · OPFS · IndexedDB · VirtualClock
        </span>

        <div className="ml-auto flex items-center gap-2">
          {!isReady && (
            <span className="text-app-muted text-[11px]">Opening IndexedDB…</span>
          )}

          {mode === "live" && isReady && !isRecording && (
            <>
              <button
                type="button"
                onClick={async () => {
                  await session?.clearRecording();
                  dispatchMetrics("reset");
                  setLiveLogs([]);
                }}
                className={btnClass(false)}
              >
                ↺ Clear
              </button>
              <button
                type="button"
                onClick={() => void startCapture()}
                className={btnClass(true)}
              >
                ⏺ Start Recording
              </button>
            </>
          )}

          {writeError && (
            <span
              className="border border-app-red rounded px-2 py-0.5 text-[10px] font-bold text-app-red flex items-center gap-1 bg-app-red/[0.18]"
              title={writeError}
            >
              ⚠ Storage full
            </span>
          )}

          {mode === "live" && isRecording && (
            <>
              <span className="text-app-red text-[11px] font-semibold">● REC</span>
              <span className="text-app-sub text-[11px] tabular-nums min-w-[44px]">
                {formatMs(elapsedSec * 1000)}
              </span>
              <span className="text-app-muted text-[10px]">/ 10:00 max</span>
              <button
                type="button"
                onClick={stopCapture}
                className={btnClass(false, true)}
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => void handleEnterReplay()}
                className={btnClass(true)}
              >
                ▶ Replay
              </button>
            </>
          )}

          {mode === "replay" && (
            <>
              <PlaybackControls
                isPlaying={isPlaying}
                rate={rate}
                onPlayPause={() => (isPlaying ? player?.pause() : player?.play(rate))}
                onRateChange={setRate}
                onExit={handleExitReplay}
                exitLabel="Exit"
                activeStyle={btn(true)}
                inactiveStyle={btn(false)}
                dangerStyle={btn(false, true)}
              />
              <span className="tabular-nums text-app-sub text-[11px] min-w-[80px] text-right">
                {formatMs(elapsed)} / {formatMs(total)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Timeline */}
      {mode === "replay" && timeRange && (
        <div className="px-4 bg-app-panel border-b border-app-border shrink-0">
          <ReplayTimeline
            timeline={timeline}
            formatTime={(t, e) =>
              `${new Date(t).toLocaleTimeString("en-US", { hour12: false })} (+${formatMs(t - e)})`
            }
            style={{ padding: "8px 0" }}
          />
        </div>
      )}

      {/* Split view */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Live */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-app-border">
          <SectionHeader
            label="LIVE"
            dot={isRecording ? T.red : T.textMuted}
            dotBlink={isRecording}
          />
          <div className="flex-none aspect-video relative max-h-[50%] bg-black">
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain block"
            />
            {!isRecording && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-app-muted">
                <div className="text-[40px]">🖥</div>
                <div className="text-xs">Click "Start Recording" to begin</div>
              </div>
            )}
          </div>
          <div className="flex-none p-4 flex flex-col gap-4">
            {isRecording ? (
              <>
                <Sparkline values={metrics.cpu} color={T.accent} label="CPU %" />
                <Sparkline values={metrics.mem} color={T.green} label="Memory %" />
              </>
            ) : (
              <div className="text-app-muted text-xs text-center mt-6">
                {isReady
                  ? "Press Start Recording to capture screen and metrics."
                  : "Initializing…"}
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col border-t border-app-border">
            <div className="px-3 py-1 text-[10px] text-app-muted border-b border-app-border bg-app-panel shrink-0 flex gap-2.5 items-center">
              LIVE LOGS <span className="text-app-yellow">■ system</span>
              <span className="text-app-purple">■ events</span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[11px]">
              {!isRecording ? (
                <div className="text-app-muted px-4 py-3">
                  Start recording to see live logs…
                </div>
              ) : liveLogs.length === 0 ? (
                <div className="text-app-muted px-4 py-3">No logs yet…</div>
              ) : (
                reversedLiveLogs.map((log, i) => <LiveLogRow key={i} log={log} />)
              )}
            </div>
          </div>
        </div>

        {/* Replay */}
        <div className="flex-1 min-w-0 flex flex-col">
          <SectionHeader
            label="REPLAY"
            dot={isPlaying ? T.green : T.textMuted}
            extra={
              mode === "replay" ? (
                <span
                  className="text-[10px] px-1.5 py-px rounded"
                  style={{
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
          <div className="flex-none aspect-video relative max-h-[50%] bg-black">
            <canvas
              ref={replayCanvasRef}
              width={1280}
              height={720}
              className="w-full h-full object-contain block"
            />
            {mode !== "replay" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-app-muted">
                <div className="text-[40px]">⏪</div>
                <div className="text-xs">
                  Record first, then press "Replay" to time-travel
                </div>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-1 text-[10px] text-app-muted border-b border-app-border bg-app-panel shrink-0 flex gap-2.5 items-center">
              DECODED FRAMES <span className="text-app-yellow">■ system</span>
              <span className="text-app-purple">■ events</span>
              <span className="text-app-accent">■ cpu</span>
              <span className="text-app-green">■ memory</span>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[11px]">
              {mode !== "replay" ? (
                <div className="text-app-muted px-4 py-3">Waiting for replay…</div>
              ) : replayLogs.length === 0 ? (
                <div className="text-app-muted px-4 py-3">
                  Press Play to decode frames…
                </div>
              ) : (
                reversedReplayLogs.map((f, i) => (
                  <FrameRow key={i} frame={f} earliest={timeRange?.earliest ?? 0} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
