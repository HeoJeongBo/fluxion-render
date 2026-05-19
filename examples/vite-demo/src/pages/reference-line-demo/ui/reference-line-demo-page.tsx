import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  referenceLineLayer,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 8000;

export function ReferenceLineDemoPage() {
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);

  // Setpoint slider state
  const [setpoint, setSetpoint] = useState(50);
  const [tolerance, setTolerance] = useState(8);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        yMode: "fixed",
        yRange: [0, 100],
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: true,
        yPadPx: 8,
      }),
      referenceLineLayer("setpoint", {
        y: setpoint,
        bandMin: setpoint - tolerance,
        bandMax: setpoint + tolerance,
        color: "#4a6db8",
        label: `target=${setpoint}`,
      }),
      lineLayer("actual", { color: "#ff5252", lineWidth: 2, retentionMs: 12_000, maxHz: TARGET_HZ }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeOrigin],
  );

  // Live-update the reference line when sliders change
  useLayerConfig(
    host,
    referenceLineLayer("setpoint", {
      y: setpoint,
      bandMin: setpoint - tolerance,
      bandMax: setpoint + tolerance,
      color: "#4a6db8",
      label: `target=${setpoint}`,
    }),
  );

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.line("actual"),
    tick: (t, line) => {
      // Simulate a noisy PID-controlled value tracking the setpoint
      const noise = (Math.random() - 0.5) * 12;
      const drift = 6 * Math.sin(t / 3000);
      const y = Math.max(0, Math.min(100, setpoint + noise + drift));
      line.push({ t, y });
      return 1;
    },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: THEME.page.background,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 16px 8px",
          flexShrink: 0,
          borderBottom: `1px solid ${THEME.page.border}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.page.textPrimary }}>
          Reference Line — PID Setpoint Monitor
        </div>
        <div style={{ fontSize: 11, color: THEME.page.textMuted, marginTop: 2 }}>
          Dashed line = setpoint · Shaded band = ±tolerance · Red line = actual value
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <FluxionCanvas
          layers={layers}
          hostOptions={{ bgColor: THEME.chart.canvasBg }}
          onReady={setHost}
        />
      </div>

      {/* Controls */}
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${THEME.page.border}`,
          padding: "12px 16px",
          background: THEME.panel.background,
          display: "flex",
          gap: 32,
          alignItems: "center",
        }}
      >
        <SliderControl
          label="Setpoint"
          value={setpoint}
          min={10}
          max={90}
          onChange={setSetpoint}
          color="#4a6db8"
        />
        <SliderControl
          label="Tolerance ±"
          value={tolerance}
          min={2}
          max={25}
          onChange={setTolerance}
          color="#80b0ff"
        />
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 16,
            fontSize: 11,
            color: THEME.page.textMuted,
            alignItems: "center",
          }}
        >
          {[
            { color: "#4a6db8", label: "Setpoint line" },
            { color: "#4a6db850", label: `±${tolerance} band` },
            { color: "#ff5252", label: "Actual value" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{ width: 12, height: 3, background: color, borderRadius: 2 }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  onChange,
  color,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: THEME.page.textSecondary }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "monospace",
            color,
          }}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: color }}
      />
    </div>
  );
}
