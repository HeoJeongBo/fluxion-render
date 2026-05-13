import type { FluxionHost, ScatterSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import {
  stampToMs,
  generateFloat32StampedMessage,
} from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const NOISE_SCALE = 1.5;

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
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);

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
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 12,
      }),
      scatterLayer("scatter", {
        color: "#f97316",
        pointSize: 3,
        shape: "circle",
        retentionMs: 10_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: localWindowMs }));

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.scatter("scatter"),
    tick: (t, scatter) => {
      scatter.push(noisySample(t));
      return 1;
    },
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
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
          gap: 8,
          fontSize: 12,
          color: THEME.page.textSecondary,
        }}
      >
        <WindowSelector
          value={localWindowMs}
          onChange={setLocalWindowMs}
          options={WINDOW_OPTIONS}
        />
        <span>
          {hz} Hz · {localWindowMs / 1000}s window · noise ±{NOISE_SCALE}
        </span>
      </div>
    </div>
  );
}
