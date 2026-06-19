import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionCrosshair,
  stepLayer,
  useFluxionCrosshairFromLayers,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 20;
const DEFAULT_WINDOW_MS = 5000;
const Y_PAD_PX = 12;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const WINDOW_OPTIONS = [
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
] as const;

// Simulates a discrete state machine (0-4) that randomly transitions.
let state = 0;
function nextState(): number {
  if (Math.random() < 0.15) state = Math.floor(Math.random() * 5);
  return state;
}

export function StepDemoPage() {
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
      stepLayer("step", {
        color: "#a78bfa",
        lineWidth: 2,
        retentionMs: 10_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin, localWindowMs],
  );

  // Auto-creates + registers the hover cache from `layers`; returns `push`.
  const {
    chartRef,
    state: crosshairState,
    push,
  } = useFluxionCrosshairFromLayers({
    host,
    layers,
    yPadPx: Y_PAD_PX,
    xFormat: (t) => new Date(timeOrigin + t).toISOString().slice(11, 23),
    yFormat: (y) => y.toFixed(0),
  });

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.step("step"),
    tick: (t, step) => {
      const y = nextState();
      push("step", t, y);
      step.push({ t, y });
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
          cursor: crosshairState.position ? "crosshair" : "default",
        }}
      />
      <FluxionCrosshair
        state={crosshairState}
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
          {hz} Hz · {localWindowMs / 1000}s window · discrete state [0-4]
        </span>
      </div>
    </div>
  );
}
