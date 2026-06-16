import {
  FluxionCanvas,
  FluxionCrosshair,
  useFluxionCrosshairFromLayers,
  useHoverDataCache,
  useMultiSeriesChart,
  useSimpleChart,
} from "@heojeongbo/fluxion-render/react";
import { createSineSynth } from "@heojeongbo/fluxion-render/testing";
import { useState } from "react";
import { THEME } from "../../../shared/ui/theme";

// Demonstrates the one-call helper hooks added for DX:
//   • useSimpleChart       — a live line chart from a single sampler.
//   • useMultiSeriesChart  — N series + distinguishBy:"dash" so series stay
//                            distinguishable even when their values overlap.
//   • useHoverDataCache +  — crosshair that reads the axis config straight from
//     useFluxionCrosshairFromLayers   the layers (no duplicated time-window props).

const WINDOW_MS = 6_000;
const HZ = 60;
const Y_AXIS_WIDTH = 56;
const X_AXIS_HEIGHT = 28;
const Y_PAD_PX = 8;

// Three series that hover around the SAME value (tiny amplitudes, near
// frequencies) so their lines overlap heavily — exactly the flat/linear case
// where color alone fails. distinguishBy:"dash" tells them apart.
const synths = [
  createSineSynth({ freqHz: 0.25, amplitude: 0.12, seriesOffset: 0 }),
  createSineSynth({ freqHz: 0.27, amplitude: 0.1, seriesOffset: 0.4 }),
  createSineSynth({ freqHz: 0.23, amplitude: 0.11, seriesOffset: 0.8 }),
];
const SERIES = [
  { id: "m0", color: "#4fc3f7", label: "motor 0", synth: synths[0]! },
  { id: "m1", color: "#80ffa0", label: "motor 1", synth: synths[1]! },
  { id: "m2", color: "#ffb060", label: "motor 2", synth: synths[2]! },
];

function MultiSeriesPanel() {
  const cache = useHoverDataCache();
  const [layout, setLayout] = useState<"overlay" | "lanes">("lanes");
  const { layers, host, setHost } = useMultiSeriesChart({
    hz: HZ,
    windowMs: WINDOW_MS,
    layout, // "lanes": each series in its own band (no shared-axis lie)
    distinguishBy: "dash", // still dash within a lane / in overlay
    cache: cache.cache, // samples auto-populate the hover cache
    axis: {
      xMode: "time",
      xTickFormat: "HH:mm:ss",
      gridColor: THEME.chart.gridColor,
      gridDashArray: [3, 3],
      axisColor: THEME.chart.axisColor,
      yPadPx: Y_PAD_PX,
    },
    series: SERIES.map((s) => ({
      id: s.id,
      color: s.color,
      label: s.label,
      sample: (t: number) => s.synth(t),
    })),
  });

  // Crosshair derives xMode / timeWindowMs / timeOrigin from `layers` — no
  // need to repeat the axis config here.
  const { chartRef, state } = useFluxionCrosshairFromLayers({
    host,
    cache: cache.cache,
    layers,
    yPadPx: Y_PAD_PX,
    yFormat: (y) => y.toFixed(3),
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
      <button
        type="button"
        onClick={() => setLayout(layout === "lanes" ? "overlay" : "lanes")}
        style={{
          position: "absolute",
          top: 6,
          right: 10,
          padding: "3px 10px",
          borderRadius: 6,
          border: `1px solid ${THEME.button.border}`,
          background: THEME.button.background,
          color: THEME.button.text,
          cursor: "pointer",
          fontSize: 11,
        }}
      >
        layout: {layout}
      </button>
    </div>
  );
}

function SimplePanel() {
  const { layers, setHost, rate } = useSimpleChart({
    hz: HZ,
    windowMs: WINDOW_MS,
    color: "#4fc3f7",
    sample: (t) => Math.sin(t / 600),
    axis: {
      xTickFormat: "HH:mm:ss",
      gridColor: THEME.chart.gridColor,
      gridDashArray: [3, 3],
      axisColor: THEME.chart.axisColor,
    },
  });
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
        style={{ width: "100%", height: "100%" }}
      />
      <span style={hudStyle}>useSimpleChart · {rate} samples/s</span>
    </div>
  );
}

const hudStyle = {
  position: "absolute" as const,
  top: 6,
  right: 10,
  fontSize: 11,
  color: THEME.page.textSecondary,
  pointerEvents: "none" as const,
};

export function HelpersDemoPage() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "1fr 1fr",
        gap: 8,
        height: "100%",
        width: "100%",
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      <section style={panelStyle}>
        <Header text="useMultiSeriesChart layout:'lanes' — each overlapping series gets its own band (own y-range, no shared-axis lie). Toggle overlay/lanes ↗. hover shows the real y." />
        <div style={{ flex: 1, minHeight: 0 }}>
          <MultiSeriesPanel />
        </div>
      </section>
      <section style={panelStyle}>
        <Header text="useSimpleChart — a live line in one hook call" />
        <div style={{ flex: 1, minHeight: 0 }}>
          <SimplePanel />
        </div>
      </section>
    </div>
  );
}

const panelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  minHeight: 0,
  border: `1px solid ${THEME.panel.border}`,
  borderRadius: 8,
  background: THEME.panel.background,
  overflow: "hidden",
};

function Header({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 600,
        color: THEME.page.textPrimary,
        borderBottom: `1px solid ${THEME.panel.border}`,
      }}
    >
      {text}
    </div>
  );
}
