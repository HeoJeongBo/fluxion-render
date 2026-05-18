import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionGauge,
  lineLayer,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { generateFloat32StampedMessage, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const THRESHOLDS = [
  { value: 0, color: "#4caf50" },
  { value: 60, color: "#ffb060" },
  { value: 80, color: "#ff5252" },
];

function ThresholdLegend() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {[
        { color: "#4caf50", label: "Normal (0–59%)" },
        { color: "#ffb060", label: "Warning (60–79%)" },
        { color: "#ff5252", label: "Critical (≥80%)" },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: THEME.page.textSecondary }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function GaugeDemoPage() {
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [currentValue, setCurrentValue] = useState(0);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss.SSS",
        xTickIntervalMs: 1000,
        yMode: "fixed",
        yRange: [0, 100],
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: true,
        yPadPx: 8,
      }),
      lineLayer("cpu", { color: "#4fc3f7", lineWidth: 2, retentionMs: 10_000, maxHz: TARGET_HZ }),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: DEFAULT_WINDOW_MS }));

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.line("cpu"),
    tick: (t, line) => {
      const raw = generateFloat32StampedMessage(t);
      const base = 40 + 35 * Math.sin(t / 4000);
      const burst = Math.random() < 0.01 ? 30 * Math.random() : 0;
      const noise = (raw.data - 0.5) * 6;
      const y = Math.max(0, Math.min(100, base + burst + noise));
      line.push({ t: stampToMs(raw.header), y });
      setCurrentValue(y);
      return 1;
    },
  });

  const gaugeProps = { value: currentValue, min: 0, max: 100, thresholds: THRESHOLDS };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: THEME.page.background }}>

      {/* Chart section */}
      <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.page.textPrimary }}>CPU Load (%)</div>
          <div style={{ fontSize: 11, color: THEME.page.textMuted, marginTop: 2 }}>
            Live signal — gauges below reflect the current value in real time
          </div>
        </div>
        <ThresholdLegend />
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
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
      </div>

      {/* Divider with current value */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px", flexShrink: 0 }}>
        <div style={{ flex: 1, height: 1, background: THEME.page.border }} />
        <div style={{ fontSize: 12, color: THEME.page.textSecondary, whiteSpace: "nowrap" }}>
          Current:{" "}
          <span style={{ fontWeight: 700, fontFamily: "monospace", color: THEME.page.textPrimary }}>
            {currentValue.toFixed(1)}%
          </span>
        </div>
        <div style={{ flex: 1, height: 1, background: THEME.page.border }} />
      </div>

      {/* Gauge row */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          borderTop: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 0", borderRight: `1px solid ${THEME.page.border}`, gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: THEME.page.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>Arc</div>
          <FluxionGauge {...gaugeProps} type="arc" size={140} showValue />
          <div style={{ fontSize: 11, color: THEME.page.textMuted }}>Semicircle · common for dashboards</div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 0", borderRight: `1px solid ${THEME.page.border}`, gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: THEME.page.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>Circle</div>
          <FluxionGauge {...gaugeProps} type="circle" size={120} showValue />
          <div style={{ fontSize: 11, color: THEME.page.textMuted }}>Full ring · compact layout</div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 0", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: THEME.page.textMuted, letterSpacing: "0.05em", textTransform: "uppercase" }}>Bar</div>
          <FluxionGauge {...gaugeProps} type="bar" size={220} barHeight={22} showValue />
          <div style={{ fontSize: 11, color: THEME.page.textMuted }}>Horizontal · good for lists</div>
        </div>
      </div>

    </div>
  );
}
