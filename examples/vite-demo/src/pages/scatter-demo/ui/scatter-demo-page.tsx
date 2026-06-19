import type { FluxionHost, ScatterSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionCrosshair,
  scatterLayer,
  useFluxionCrosshairFromLayers,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { generateFloat32StampedMessage, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const NOISE_SCALE = 1.5;
const Y_PAD_PX = 12;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const WINDOW_OPTIONS = [
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
] as const;

function noisySample(tMs: number): ScatterSample {
  const base = generateFloat32StampedMessage(tMs);
  const noise = (Math.random() - 0.5) * 2 * NOISE_SCALE;
  return { t: stampToMs(base.header), y: base.data + noise };
}

export function ScatterDemoPage() {
  const [localWindowMs, setLocalWindowMs] = useState(DEFAULT_WINDOW_MS);
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);

  // The axis layer is the single source of truth for the time window — the
  // crosshair reads it from here, so the selector drives both.
  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: localWindowMs,
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
      scatterLayer("scatter", {
        color: "#f97316",
        pointSize: 3,
        shape: "circle",
        retentionMs: 10_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin, localWindowMs],
  );

  // Auto-creates + registers the hover cache from `layers`; returns `push`.
  const { chartRef, state, push } = useFluxionCrosshairFromLayers({
    host,
    layers,
    yPadPx: Y_PAD_PX,
    xFormat: (t) => new Date(timeOrigin + t).toISOString().slice(11, 23),
    yFormat: (y) => y.toFixed(4),
  });

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.scatter("scatter"),
    tick: (t, scatter) => {
      const sample = noisySample(t);
      push("scatter", sample.t, sample.y);
      scatter.push(sample);
      return 1;
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
          fontSize: 12,
          color: THEME.page.textSecondary,
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <WindowSelector
            value={localWindowMs}
            onChange={setLocalWindowMs}
            options={WINDOW_OPTIONS}
          />
        </div>
        <span>
          {hz} Hz · {localWindowMs / 1000}s window · noise ±{NOISE_SCALE}
        </span>
      </div>
    </div>
  );
}
