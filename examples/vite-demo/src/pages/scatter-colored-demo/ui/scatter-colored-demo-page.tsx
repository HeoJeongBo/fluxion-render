import type { FluxionHost, ScatterColoredSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterColoredLayer,
  useFluxionStream,
  useLayerConfig,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { generateFloat32StampedMessage, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const WINDOW_OPTIONS = [
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
] as const;

type ColormapOption = "viridis" | "plasma" | "hot" | "gradient";
const COLORMAPS: ColormapOption[] = ["viridis", "plasma", "hot", "gradient"];

export function ScatterColoredDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);
  const [colormap, setColormap] = useState<ColormapOption>("viridis");

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss.SSS",
        xTickIntervalMs: 1000,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 12,
      }),
      scatterColoredLayer("colored", {
        colormap: "viridis",
        minSize: 3,
        maxSize: 10,
        shape: "circle",
        retentionMs: 10_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: windowMs }));
  useLayerConfig(host, scatterColoredLayer("colored", { colormap }));

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.scatterColored("colored"),
    tick: (t, scatter) => {
      const msg = generateFloat32StampedMessage(t);
      const noise = (Math.random() - 0.5) * 2;
      const y = msg.data + noise;
      const speed = Math.abs(Math.sin(t / 1000));
      const sample: ScatterColoredSample = {
        t: stampToMs(msg.header),
        y,
        colorValue: speed,
        size: 0.3 + speed * 0.7,
      };
      scatter.push(sample);
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
          gap: 12,
          alignItems: "center",
          borderBottom: `1px solid ${THEME.page.border}`,
        }}
      >
        <span style={{ fontSize: 12, color: THEME.page.textSecondary }}>
          Color encodes speed · size encodes magnitude · {hz} Hz
        </span>
        <div
          style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}
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
          <WindowSelector
            value={windowMs}
            onChange={setWindowMs}
            options={WINDOW_OPTIONS}
          />
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
