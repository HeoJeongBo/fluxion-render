import type { FluxionHost, LineSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionCrosshair,
  lineLayer,
  useFluxionCrosshairFromLayers,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import {
  type Float32StampedMessage,
  generateFloat32StampedBatch,
  stampToMs,
} from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

// 500 Hz ingest, delivered in batches. A naive 2 ms `setInterval` push would
// jitter badly under browser timer clamping, so instead we tick at a sane
// 50 Hz and push the 10 samples that "arrived" since the last tick in one
// `pushBatch()` — a single zero-copy postMessage per tick (50 msgs/s, not 500).
const BATCH_HZ = 50;
const SAMPLES_PER_BATCH = 10;
const SAMPLES_PER_SEC = BATCH_HZ * SAMPLES_PER_BATCH; // 500
const DT_MS = 1000 / SAMPLES_PER_SEC; // 2 ms — true 500 Hz spacing

const DEFAULT_WINDOW_MS = 5000;
const MAX_WINDOW_MS = 10_000;
// Size the ring to the largest window we can show, at the real sample rate.
// (Pass `capacity` directly — `maxHz` only sizes the ring and would silently
// drop data if it didn't match the actual 500 Hz rate.)
const RING_CAPACITY = Math.ceil((MAX_WINDOW_MS / 1000) * SAMPLES_PER_SEC * 1.2);

const Y_PAD_PX = 8;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const WINDOW_OPTIONS = [
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
] as const;

const transformBatch = (msgs: Float32StampedMessage[]): LineSample[] =>
  msgs.map((m) => ({ t: stampToMs(m.header), y: m.data }));

export interface HighRateDemoPageProps {
  windowMs?: number;
  hideSelector?: boolean;
  compactHud?: boolean;
}

export function HighRateDemoPage({
  windowMs: windowProp,
  hideSelector = false,
  compactHud = false,
}: HighRateDemoPageProps = {}) {
  const [localWindowMs, setLocalWindowMs] = useState(DEFAULT_WINDOW_MS);
  const windowMs = windowProp ?? localWindowMs;
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);

  // The axis layer is the single source of truth for the time window — the
  // crosshair reads it from here, so the selector/prop drives both.
  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: windowMs,
        timeOrigin,
        xTickFormat: "HH:mm:ss.SSS",
        xTickIntervalMs: 1000,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: Y_PAD_PX,
      }),
      lineLayer("line", {
        color: "#4fc3f7",
        lineWidth: 1.5,
        capacity: RING_CAPACITY,
        // 500 Hz over a multi-second window is far more samples than pixels —
        // min/max-decimate the DRAW (data is fully retained for hover/export).
        decimate: true,
      }),
    ],
    [timeOrigin, windowMs],
  );

  // Auto-creates + registers the hover cache from `layers`. 500 Hz over a 10s
  // window exceeds the default cache size, so match the line ring via overrides.
  const { chartRef, state, pushBatch } = useFluxionCrosshairFromLayers({
    host,
    layers,
    overrides: { line: { capacity: RING_CAPACITY } },
    yPadPx: Y_PAD_PX,
    xFormat: (t) => new Date(timeOrigin + t).toISOString().slice(11, 23),
    yFormat: (y) => y.toFixed(4),
  });

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / BATCH_HZ,
    setup: (h) => h.line("line"),
    tick: (t, line) => {
      // The `t` of this tick is the END of the batch window; generate the
      // SAMPLES_PER_BATCH samples that fill [t - batchSpan, t) at 2 ms spacing.
      const tStart = t - SAMPLES_PER_BATCH * DT_MS;
      const msgs = generateFloat32StampedBatch(tStart, SAMPLES_PER_BATCH, DT_MS, {
        freqHz: 1.2,
        amplitude: 0.9,
      });
      const batch = transformBatch(msgs);
      // Mirror into the hover cache as one interleaved [t,y,…] batch.
      const flat = new Float32Array(batch.length * 2);
      for (let i = 0; i < batch.length; i++) {
        flat[i * 2] = batch[i]!.t;
        flat[i * 2 + 1] = batch[i]!.y;
      }
      pushBatch("line", flat);
      line.pushBatch(batch); // one zero-copy postMessage for all 10 samples
      return SAMPLES_PER_BATCH; // → `rate` reports ~500 Hz
    },
  });

  const visiblePoints = Math.round((SAMPLES_PER_SEC * windowMs) / 1000);

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
      <div
        ref={chartRef}
        style={{
          position: "absolute",
          top: 0,
          left: Y_AXIS_WIDTH,
          right: 0,
          bottom: X_AXIS_HEIGHT,
          pointerEvents: "auto",
          cursor: state.position ? "crosshair" : "default",
        }}
      />
      <FluxionCrosshair
        state={state}
        style={{
          position: "absolute",
          top: 0,
          left: Y_AXIS_WIDTH,
          right: 0,
          bottom: X_AXIS_HEIGHT,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: compactHud ? 11 : 12,
          color: THEME.page.textSecondary,
          pointerEvents: "none",
        }}
      >
        {!hideSelector && (
          <div style={{ pointerEvents: "auto" }}>
            <WindowSelector
              value={windowMs}
              onChange={setLocalWindowMs}
              options={WINDOW_OPTIONS}
              compact={compactHud}
            />
          </div>
        )}
        <span>
          {hz} Hz · {windowMs / 1000}s window · {visiblePoints} pts/frame
          {!compactHud && ` · target ${SAMPLES_PER_SEC} Hz`}
        </span>
      </div>
    </div>
  );
}
