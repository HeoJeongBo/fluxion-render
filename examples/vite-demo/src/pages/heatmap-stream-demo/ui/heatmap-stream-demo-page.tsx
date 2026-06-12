import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  heatmapStreamLayer,
  useFluxionStream,
  useLayerConfig,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const Y_BINS = 32;
const DEFAULT_WINDOW_MS = 5000;
const TARGET_HZ = 20;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

type ColormapOption = "viridis" | "plasma" | "hot";
const COLORMAPS: ColormapOption[] = ["viridis", "plasma", "hot"];

/** Generates a simulated occupancy/spectrogram column (32 bins). */
function generateColumn(tMs: number): Float32Array {
  const col = new Float32Array(Y_BINS);
  const peak = (Math.sin(tMs / 800) * 0.5 + 0.5) * (Y_BINS - 1);
  for (let i = 0; i < Y_BINS; i++) {
    const dist = Math.abs(i - peak);
    const gauss = Math.exp(-(dist * dist) / 20);
    col[i] = gauss * (0.7 + 0.3 * Math.random());
  }
  return col;
}

export function HeatmapStreamDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [colormap, setColormap] = useState<ColormapOption>("viridis");

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss.SSS",
        xTickIntervalMs: 1000,
        yMode: "fixed",
        yRange: [0, Y_BINS],
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
      }),
      heatmapStreamLayer("heatmap", {
        yBins: Y_BINS,
        maxCols: 512,
        yRange: [0, Y_BINS],
        colormap: "viridis",
      }),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: DEFAULT_WINDOW_MS }));
  useLayerConfig(host, heatmapStreamLayer("heatmap", { colormap }));

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.heatmapStream("heatmap"),
    tick: (t, heatmap) => {
      heatmap.pushColumn(t, generateColumn(t));
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
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: `1px solid ${THEME.page.border}`,
        }}
      >
        <span style={{ fontSize: 12, color: THEME.page.textSecondary }}>
          Streaming heatmap ({Y_BINS} y-bins) · {hz} Hz · simulated spectrogram
        </span>
        <div
          style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}
        >
          <span style={{ fontSize: 12, color: THEME.page.textSecondary }}>Colormap:</span>
          {COLORMAPS.map((cm) => (
            <button
              key={cm}
              onClick={() => setColormap(cm)}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                background:
                  cm === colormap
                    ? THEME.button.background
                    : THEME.button.inactiveBackground,
                color: cm === colormap ? THEME.button.text : THEME.button.inactiveText,
                border: `1px solid ${cm === colormap ? THEME.button.border : THEME.button.inactiveBorder}`,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {cm}
            </button>
          ))}
        </div>
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
    </div>
  );
}
