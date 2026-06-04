import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import {
  createRandomLogProducer,
  formatBytes,
  formatMs,
  LogChannel,
  MetricChannel,
  type ReplayPlayerFrame,
  snapTimeToSegment,
  VideoChannel,
} from "@heojeongbo/fluxion-replay";
import {
  DvrBadge,
  PlaybackControls,
  type RecordingSegment,
  useChartReplayBridge,
  useDisplayMedia,
  useLiveTimeRange,
  usePlaybackRate,
  useRecordingSession,
  useRecordingTimer,
  useReplayDvr,
  useReplayPlayer,
  useReplaySession,
  useReplayTimeline,
  useStorageInfo,
  useVideoRecorder,
  useVideoReplayer,
} from "@heojeongbo/fluxion-replay/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  SYSTEM_MSGS,
  T,
  VIDEO_CHANNEL_ID,
} from "./shared";

// ─── Channels & session ───────────────────────────────────────────────────────

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

// (sample data, theme `T`, formatMs/formatBytes, btn/btnClass, types, and the
// LiveLogRow/FrameRow rows now live in ./shared or the library)

// ─── Sub-components ───────────────────────────────────────────────────────────

const MINI_COLORS = [
  "#4fc3f7",
  "#80ffa0",
  "#ffb060",
  "#f48fb1",
  "#ce93d8",
  "#80cbc4",
  "#ffcc02",
  "#ef9a9a",
];

function MiniChart({ index }: { index: number }) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const color = MINI_COLORS[index % MINI_COLORS.length]!;
  const freqHz = 0.3 + (index % 7) * 0.25;
  const timeOrigin = useMemo(() => Date.now(), []);
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
    intervalMs: 50,
    setup: (h) => h.line("line"),
    tick: (t, h) => {
      h.push({
        t,
        y: Math.sin((2 * Math.PI * freqHz * t) / 1000) + (Math.random() - 0.5) * 0.3,
      });
      return 1;
    },
  });
  return (
    <div className="relative min-w-0 min-h-0 bg-app-panel border border-app-border rounded-[3px] overflow-hidden">
      <div className="absolute top-[3px] left-[5px] text-[8px] text-app-muted pointer-events-none z-[1]">
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

// (LiveLogRow / FrameRow now imported from ./shared)

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
  onSeek: (f: number) => void;
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
    if (!isDvr && inputRef.current) inputRef.current.value = "10000";
  }, [isDvr]);
  const dur = latest - earliest;
  return (
    <div style={{ position: "relative", padding: "2px 0" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          height: 4,
          background: T.border,
          borderRadius: 2,
          pointerEvents: "none",
        }}
      >
        {dur > 0 &&
          segments.map((seg, i) => {
            const segEnd = seg.end ?? latest;
            const left = ((seg.start - earliest) / dur) * 100;
            const width = ((Math.min(segEnd, latest) - seg.start) / dur) * 100;
            if (width <= 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${width}%`,
                  height: "100%",
                  background: isDvr ? T.accent : T.red,
                  borderRadius: 2,
                }}
              />
            );
          })}
      </div>
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={10_000}
        step={1}
        defaultValue={10_000}
        disabled={disabled}
        onPointerDown={() => {
          isDraggingRef.current = true;
        }}
        onPointerUp={(e) => {
          isDraggingRef.current = false;
          onSeek(Number((e.currentTarget as HTMLInputElement).value) / 10_000);
        }}
        style={{
          position: "relative",
          width: "100%",
          accentColor: isDvr ? T.accent : T.red,
          cursor: disabled ? "default" : "pointer",
          background: "transparent",
        }}
      />
    </div>
  );
}

// ─── DVR App ──────────────────────────────────────────────────────────────────

export function DvrApp() {
  const { session, isReady, enterReplay, exitReplay } = useReplaySession(SESSION_OPTS);
  const { stream, start: startCapture, stop: stopCapture } = useDisplayMedia();
  const { timeRange, segments, seed: seedTimeRange } = useLiveTimeRange(session);
  const storageInfo = useStorageInfo(session, { intervalMs: 3000 });

  const [liveLogs, setLiveLogs] = useState<LiveLogEntry[]>([]);
  const [dvrLogs, setDvrLogs] = useState<ReplayPlayerFrame[]>([]);
  const [rightTab, setRightTab] = useState<"logs" | "charts">("logs");

  // ── Log append ref (stable across renders) ────────────────────────────────
  const appendLog = useRef(setLiveLogs);
  appendLog.current = setLiveLogs;

  // ── Recording session ─────────────────────────────────────────────────────
  const { isRecording } = useRecordingSession({
    session,
    enabled: isReady && !!stream,
    clearOnStart: false,
    seedTimeRange,
    channels: [
      {
        channelId: LOG_CHANNEL_ID,
        intervalMs: 2000,
        produce: createRandomLogProducer({
          messages: SYSTEM_MSGS,
          onEmit: (e) =>
            appendLog.current((prev) => [
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
            appendLog.current((prev) => [
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
  });
  const { elapsedSec } = useRecordingTimer({ isRecording });

  // ── DVR controller ─────────────────────────────────────────────────────────
  const dvr = useReplayDvr({
    session,
    enterReplay,
    exitReplay,
    liveTimeRange: timeRange,
    autoPlay: true,
    autoExitToLive: true,
  });
  const { rate, setRate } = usePlaybackRate({ player: dvr.player });

  // ── Video refs ─────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = stream;
      if (stream) void liveVideoRef.current.play();
    }
  }, [stream]);
  useVideoReplayer(
    dvr.isDvr ? dvr.player : null,
    canvasRef,
    session?.store ?? null,
    VIDEO_CHANNEL_ID,
  );

  // ── Metrics chart ──────────────────────────────────────────────────────────
  const [chartHost, setChartHost] = useState<FluxionHost | null>(null);
  const tOrigin = useMemo(() => Date.now(), []);
  const chartLayers = useMemo(
    () => [
      axisGridLayer("axis", { xMode: "time", timeWindowMs: 30_000, timeOrigin: tOrigin }),
      lineLayer(CPU_CHANNEL_ID, {
        color: T.accent,
        lineWidth: 1.5,
        retentionMs: 600_000,
        maxHz: 5,
      }),
      lineLayer(MEM_CHANNEL_ID, {
        color: T.green,
        lineWidth: 1.5,
        retentionMs: 600_000,
        maxHz: 5,
      }),
    ],
    [tOrigin],
  );
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

  // ── DVR frame log ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dvr.player) {
      setDvrLogs([]);
      return;
    }
    return dvr.player.onFrame((f) => {
      if (f.channelId !== VIDEO_CHANNEL_ID) setDvrLogs((p) => [...p.slice(-99), f]);
    });
  }, [dvr.player]);

  // ── Timeline / scrubber ────────────────────────────────────────────────────
  const replayPlayer = useReplayPlayer(dvr.player);
  const timeline = useReplayTimeline(dvr.player, dvr.effectiveTimeRange);
  const isPlaying = replayPlayer.state === "playing";

  const handleSeek = useCallback(
    (fraction: number) => {
      if (!timeRange) return;
      const effectiveLatest = dvr.effectiveTimeRange?.latest ?? timeRange.latest;
      const raw = timeRange.earliest + fraction * (effectiveLatest - timeRange.earliest);
      const t = snapTimeToSegment(raw, segments, effectiveLatest);
      if (fraction >= 0.9999) dvr.exit();
      else void dvr.enter(t);
    },
    [dvr, timeRange, segments],
  );

  const handleStartCapture = useCallback(async () => {
    try {
      await startCapture({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: false,
      });
    } catch (e) {
      if ((e as Error).name !== "NotAllowedError")
        console.error("[DVR] startCapture failed:", e);
    }
  }, [startCapture]);

  const handleStopCapture = useCallback(() => {
    stopCapture();
    setLiveLogs([]);
  }, [stopCapture]);

  const reversedLiveLogs = useMemo(() => [...liveLogs].reverse(), [liveLogs]);
  const reversedDvrLogs = useMemo(() => [...dvrLogs].reverse(), [dvrLogs]);
  const { isDvr, frozenLatest } = dvr;

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-app-bg text-app-text font-sans text-[13px]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-app-border bg-app-panel shrink-0 h-11">
        <span className="font-bold text-[13px]">fluxion-replay</span>
        <span className="text-app-muted text-[11px]">
          DVR · WebCodecs · OPFS · IndexedDB
        </span>

        {isDvr && (
          <DvrBadge
            currentT={replayPlayer.currentT}
            textColor={T.yellow}
            backgroundColor="rgba(251,191,36,0.18)"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isReady && (
            <span className="text-app-muted text-[11px]">Opening IndexedDB…</span>
          )}

          {isReady && !isRecording && !stream && (
            <>
              <button
                type="button"
                onClick={async () => {
                  dvr.exit();
                  await session?.clearRecording();
                }}
                className={btnClass(false)}
              >
                ↺ Clear
              </button>
              <button
                type="button"
                onClick={() => void handleStartCapture()}
                className={btnClass(true)}
              >
                ⏺ Start Recording
              </button>
            </>
          )}

          {isRecording && (
            <>
              <span className="text-app-red text-[11px] font-semibold">● REC</span>
              <span className="text-app-sub text-[11px] tabular-nums min-w-[44px]">
                {formatMs(elapsedSec * 1000)}
              </span>
              <span className="text-app-muted text-[10px]">/ 10:00 max</span>
            </>
          )}

          {isDvr && (
            <>
              <div className="w-px h-4 bg-app-border mx-1" />
              <PlaybackControls
                isPlaying={isPlaying}
                rate={rate}
                onPlayPause={() =>
                  isPlaying ? dvr.player?.pause() : dvr.player?.play(rate)
                }
                onRateChange={setRate}
                onExit={isRecording ? dvr.exit : handleStopCapture}
                exitLabel={isRecording ? "LIVE" : "Stop"}
                activeStyle={btn(true)}
                inactiveStyle={btn(false)}
                dangerStyle={
                  isRecording
                    ? {
                        padding: "4px 12px",
                        borderRadius: 20,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        border: "none",
                        background: T.red,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }
                    : btn(false, true)
                }
              />
              {isRecording && (
                <span className="tabular-nums text-app-yellow text-[11px] min-w-[80px]">
                  -{formatMs(Date.now() - replayPlayer.currentT)} behind
                </span>
              )}
            </>
          )}

          {isRecording && !isDvr && (
            <button
              type="button"
              onClick={handleStopCapture}
              className={btnClass(false, true)}
            >
              ■ Stop
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: Video + metrics + live logs */}
        <div className="flex-none w-[60%] flex flex-col border-r border-app-border min-h-0 overflow-hidden">
          <div className="flex-none aspect-video relative max-h-[50%] overflow-hidden bg-black">
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-contain block absolute inset-0 transition-opacity duration-200"
              style={{ opacity: isDvr ? 0 : 1 }}
            />
            <canvas
              ref={canvasRef}
              className="block w-full h-full object-contain absolute inset-0 transition-opacity duration-200"
              style={{ opacity: isDvr ? 1 : 0 }}
            />
            {!isRecording && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-app-muted">
                <div className="text-[40px]">🖥</div>
                <div className="text-xs">Click "Start Recording" to begin</div>
              </div>
            )}
            {isRecording && !isDvr && (
              <div className="absolute top-2 left-2 border border-app-red rounded px-2 py-0.5 text-[10px] font-bold text-app-red flex items-center gap-1 bg-app-red/[0.18]">
                <span>●</span> LIVE
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div
              className="flex-none h-[90px] border-b border-app-border"
              style={{ display: isRecording || isDvr ? "block" : "none" }}
            >
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
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-[3px] text-[10px] text-app-muted border-b border-app-border bg-app-panel shrink-0 flex gap-2 items-center">
                <span>LIVE LOGS</span>
                <span className="text-app-yellow">■ system</span>
                <span className="text-app-purple">■ events</span>
              </div>
              <div className="flex-1 overflow-y-auto font-mono text-[11px]">
                {!isRecording ? (
                  <div className="text-app-muted px-3 py-2.5">
                    Start recording to see live logs…
                  </div>
                ) : liveLogs.length === 0 ? (
                  <div className="text-app-muted px-3 py-2.5">No logs yet…</div>
                ) : (
                  reversedLiveLogs.map((log, i) => <LiveLogRow key={i} log={log} />)
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 text-[10px] border-b border-app-border bg-app-panel shrink-0 flex items-stretch">
            {(["logs", "charts"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setRightTab(tab)}
                className={`bg-none border-none cursor-pointer px-2.5 py-[5px] text-[10px] font-semibold tracking-[0.05em] border-b-2 -mb-px ${
                  rightTab === tab
                    ? "text-app-accent border-app-accent"
                    : "text-app-muted border-transparent"
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
            {rightTab === "logs" && (
              <div className="flex gap-2 items-center ml-2">
                <span className="text-app-yellow">■ system</span>
                <span className="text-app-purple">■ events</span>
                <span className="text-app-accent">■ cpu</span>
                <span className="text-app-green">■ memory</span>
              </div>
            )}
          </div>
          <div
            className="flex-1 overflow-y-auto font-mono text-[11px]"
            style={{ display: rightTab === "logs" ? "block" : "none" }}
          >
            {!isDvr ? (
              <div className="text-app-muted px-4 py-3">
                {isRecording
                  ? "Drag the timeline to time-travel…"
                  : "Start recording first."}
              </div>
            ) : dvrLogs.length === 0 ? (
              <div className="text-app-muted px-4 py-3">Press Play to decode frames…</div>
            ) : (
              reversedDvrLogs.map((f, i) => (
                <FrameRow key={i} frame={f} earliest={timeRange?.earliest ?? 0} />
              ))
            )}
          </div>
          <div
            className="flex-1 min-h-0 gap-[3px] p-1.5 bg-app-bg overflow-hidden"
            style={{
              display: rightTab === "charts" ? "grid" : "none",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridTemplateRows: "repeat(5, 1fr)",
            }}
          >
            {Array.from({ length: 20 }, (_, i) => (
              <MiniChart key={i} index={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Timeline bar */}
      {(isRecording || timeRange) && (
        <div className="shrink-0 bg-app-panel border-t border-app-border px-4 pt-1.5 pb-2 overflow-hidden">
          <div className="mb-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 bg-app-border rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-[width] duration-500 ease"
                style={{
                  width: storageInfo
                    ? `${Math.min(100, storageInfo.percentUsed)}%`
                    : "0%",
                  background: storageInfo
                    ? storageInfo.percentUsed > 80
                      ? T.red
                      : storageInfo.percentUsed > 50
                        ? T.yellow
                        : T.accent
                    : T.accent,
                }}
              />
            </div>
            <span className="text-app-muted text-[9px] tabular-nums whitespace-nowrap shrink-0">
              {storageInfo
                ? `${formatBytes(storageInfo.usedBytes)} / ${formatBytes(storageInfo.quotaBytes)} (${storageInfo.percentUsed.toFixed(1)}%)`
                : "Storage: --"}
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px] text-app-muted mb-0.5">
            <span>
              {timeRange
                ? new Date(timeRange.earliest).toLocaleTimeString("en-US", {
                    hour12: false,
                  })
                : "--:--:--"}
            </span>
            {isDvr && isRecording ? (
              <button
                type="button"
                onClick={dvr.exit}
                className="px-2 py-0.5 rounded-xl cursor-pointer text-[10px] font-bold tracking-[0.04em] border border-app-red text-app-red flex items-center gap-1 bg-app-red/15"
              >
                <span className="text-[7px]">●</span> LIVE
              </button>
            ) : (
              <span className="flex items-center gap-1">
                {isRecording && <span className="text-app-red text-[9px]">●</span>}
                {timeRange
                  ? new Date(
                      isDvr && frozenLatest != null ? frozenLatest : timeRange.latest,
                    ).toLocaleTimeString("en-US", { hour12: false })
                  : "--:--:--"}
                {isRecording && (
                  <span className="text-app-muted text-[9px] ml-0.5">LIVE</span>
                )}
              </span>
            )}
          </div>
          <UnifiedScrubber
            isDvr={isDvr}
            dvrFraction={timeline.fraction}
            disabled={!timeRange}
            onSeek={handleSeek}
            segments={segments}
            earliest={timeRange?.earliest ?? 0}
            latest={
              isDvr && frozenLatest != null ? frozenLatest : (timeRange?.latest ?? 0)
            }
          />
        </div>
      )}
    </div>
  );
}
