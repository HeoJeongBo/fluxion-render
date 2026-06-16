import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { createSineSynth } from "@heojeongbo/fluxion-render/testing";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

// Demonstrates the SERIALIZABLE object form of xTickFormat / yTickFormat.
// Object formats cross the worker boundary, so they format the labels the
// worker draws on the external-axis canvas (function formats can't — they only
// apply React-side). Toggle between a wall-clock x-axis and a numeric one.

const WINDOW_MS = 8_000;
const HZ = 60;
const Y_AXIS_WIDTH = 72;
const X_AXIS_HEIGHT = 30;
const Y_PAD_PX = 8;

const synth = createSineSynth({ freqHz: 0.6, amplitude: 800, seriesOffset: 0 });

type Mode = "clock" | "numeric";

export function AxisFormatDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [mode, setMode] = useState<Mode>("clock");

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: WINDOW_MS,
        timeOrigin,
        // OBJECT form of xTickFormat (serializable → drawn by the worker):
        //  clock   → wall-clock via `pattern`
        //  numeric → elapsed value with precision + unit suffix
        xTickFormat:
          mode === "clock" ? { pattern: "HH:mm:ss" } : { precision: 1, suffix: "ms" },
        xTickIntervalMs: 1000,
        // OBJECT form of yTickFormat: SI-scale (k/M) + unit suffix.
        yTickFormat: { si: true, suffix: "B" },
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        yPadPx: Y_PAD_PX,
      }),
      lineLayer("signal", {
        color: "#4fc3f7",
        lineWidth: 1.5,
        retentionMs: WINDOW_MS,
        maxHz: HZ,
      }),
    ],
    [timeOrigin, mode],
  );

  useFluxionStream({
    host,
    intervalMs: 1000 / HZ,
    setup: (h) => h.line("signal"),
    tick: (t, line) => {
      line.push({ t, y: 4000 + synth(t) });
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
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          color: THEME.page.textSecondary,
        }}
      >
        <button
          type="button"
          onClick={() => setMode(mode === "clock" ? "numeric" : "clock")}
          style={{
            padding: "3px 10px",
            borderRadius: 6,
            border: `1px solid ${THEME.button.border}`,
            background: THEME.button.background,
            color: THEME.button.text,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          x: {mode === "clock" ? "HH:mm:ss" : "{ precision, suffix }"}
        </button>
        <span style={{ pointerEvents: "none" }}>
          y: {"{ si: true, suffix: 'B' }"} (worker-drawn)
        </span>
      </div>
    </div>
  );
}
