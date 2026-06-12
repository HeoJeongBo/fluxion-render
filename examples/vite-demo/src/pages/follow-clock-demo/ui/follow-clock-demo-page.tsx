import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { createSineSynth, mulberry32 } from "@heojeongbo/fluxion-render/testing";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

// Bursty stream: 5s of data, then 1s of silence, repeating. The x-axis uses
// `followClock`, so it keeps scrolling at 1-second ticks through the silent
// gap — the chart never freezes, it just shows an empty band drifting in from
// the right until data resumes. A scatter layer makes the discontinuity read
// cleanly: no connecting line bridges the gap, so the "끊김" is obvious.
const BATCH_HZ = 60;
const SAMPLES_PER_BATCH = 12;
const SAMPLE_HZ = BATCH_HZ * SAMPLES_PER_BATCH;
const TIME_WINDOW_MS = 8_000;
const Y_PAD_PX = 8;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

// One full cycle = 5s streaming + 1s paused.
const STREAM_MS = 5_000;
const PAUSE_MS = 1_000;
const CYCLE_MS = STREAM_MS + PAUSE_MS;

const SERIES = [
  { id: "s1", color: "#4fc3f7", freqHz: 0.8, amplitude: 0.9, seriesOffset: 0 },
  { id: "s2", color: "#ffb060", freqHz: 1.6, amplitude: 0.6, seriesOffset: 1.4 },
];

const noise = mulberry32(0x1234_5678);
const synths = SERIES.map((s) =>
  createSineSynth({
    freqHz: s.freqHz,
    amplitude: s.amplitude,
    seriesOffset: s.seriesOffset,
    noise: 0,
  }),
);

type SeriesHandle = {
  handle: ReturnType<FluxionHost["scatter"]>;
  synth: (tMs: number) => number;
};

type StreamState = {
  series: SeriesHandle[];
  /** Previous tick's end in host-relative ms — samples fill (lastEnd, now]. */
  lastEnd: number;
};

export function FollowClockDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [paused, setPaused] = useState(false);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: TIME_WINDOW_MS,
        timeOrigin,
        followClock: true,
        xTickFormat: "HH:mm:ss",
        xTickIntervalMs: 1000,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: Y_PAD_PX,
      }),
      ...SERIES.map((s) =>
        scatterLayer(s.id, {
          color: s.color,
          pointSize: 3,
          shape: "circle",
          retentionMs: TIME_WINDOW_MS,
          maxHz: SAMPLE_HZ,
        }),
      ),
    ],
    [timeOrigin],
  );

  const { rate } = useFluxionStream({
    host,
    intervalMs: 1000 / BATCH_HZ,
    setup: (h): StreamState => ({
      series: SERIES.map((s, i) => ({ handle: h.scatter(s.id), synth: synths[i]! })),
      // Anchor the first sample at "now" so nothing lands before the window.
      lastEnd: Date.now() - timeOrigin,
    }),
    tick: (_t, state) => {
      const nowRel = Date.now() - timeOrigin;
      const start = state.lastEnd;
      state.lastEnd = nowRel;
      if (nowRel <= start) return 0;

      // Bursty gate: stream for STREAM_MS, then go silent for PAUSE_MS.
      const streaming = nowRel % CYCLE_MS < STREAM_MS;
      // Surface the state change in the HUD (cheap — flips at most twice/cycle).
      if (streaming === paused) setPaused(!streaming);
      if (!streaming) return 0; // no points → a real gap scrolls through.

      // Spread SAMPLES_PER_BATCH evenly across the elapsed window (start, now].
      const step = (nowRel - start) / SAMPLES_PER_BATCH;
      let pushed = 0;
      for (const { handle, synth } of state.series) {
        const batch = new Array(SAMPLES_PER_BATCH);
        for (let i = 0; i < SAMPLES_PER_BATCH; i++) {
          const t = start + (i + 1) * step;
          batch[i] = { t, y: synth(t) + (noise() - 0.5) * 0.06 };
        }
        handle.pushBatch(batch);
        pushed += SAMPLES_PER_BATCH;
      }
      return pushed;
    },
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        yAxisWidth={Y_AXIS_WIDTH}
        xAxisHeight={X_AXIS_HEIGHT}
        axisColor={THEME.chart.labelColor}
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          color: THEME.page.textSecondary,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 999,
            fontWeight: 600,
            color: paused ? "#b45309" : "#15803d",
            background: paused ? "rgba(245,158,11,0.16)" : "rgba(34,197,94,0.16)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: paused ? "#f59e0b" : "#22c55e",
            }}
          />
          {paused ? "PAUSED" : "STREAMING"}
        </span>
        <span>
          {rate} samples/s · {STREAM_MS / 1000}s on / {PAUSE_MS / 1000}s off ·{" "}
          {TIME_WINDOW_MS / 1000}s window
        </span>
      </div>
    </div>
  );
}
