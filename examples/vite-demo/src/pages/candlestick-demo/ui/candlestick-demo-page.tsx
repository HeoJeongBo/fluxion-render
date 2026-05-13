import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  candlestickLayer,
  FluxionCanvas,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 4; // one candle per 250ms
const DEFAULT_WINDOW_MS = 10_000;

const WINDOW_OPTIONS = [
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
  { label: "30s", ms: 30_000 },
] as const;

let lastClose = 100;

function nextCandle(t: number) {
  const open = lastClose;
  const move = (Math.random() - 0.48) * 3;
  const high = open + Math.abs(move) + Math.random() * 1.5;
  const low = open - Math.abs(move) - Math.random() * 1.5;
  const close = open + move;
  lastClose = close;
  return { t, open, high, low, close };
}

export function CandlestickDemoPage() {
  const [localWindowMs, setLocalWindowMs] = useState(DEFAULT_WINDOW_MS);
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss",
        xTickIntervalMs: 2000,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 12,
      }),
      candlestickLayer("candle", {
        upColor: "#26a69a",
        downColor: "#ef5350",
        bodyWidth: 8,
        retentionMs: 60_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: localWindowMs }));

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.candlestick("candle"),
    tick: (t, candle) => {
      candle.push(nextCandle(t));
      return 1;
    },
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        axisConfig={{ timeWindowMs: localWindowMs }}
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
        <WindowSelector value={localWindowMs} onChange={setLocalWindowMs} options={WINDOW_OPTIONS} />
        <span>{hz} Hz · {localWindowMs / 1000}s window · simulated price</span>
      </div>
    </div>
  );
}
