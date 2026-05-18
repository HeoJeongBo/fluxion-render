import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  areaLayer,
  axisGridLayer,
  FluxionCanvas,
  FluxionCrosshair,
  HoverDataCache,
  useFluxionCrosshair,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const Y_PAD_PX = 12;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const WINDOW_OPTIONS = [
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
] as const;

const cache = new HoverDataCache();
cache.registerLayer("area", { capacity: 4096, label: "signal", color: "#4fc3f7" });

export function AreaDemoPage() {
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
        yPadPx: Y_PAD_PX,
      }),
      areaLayer("area", {
        color: "#4fc3f7",
        fillOpacity: 0.25,
        lineWidth: 1.5,
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
    setup: (h) => h.area("area"),
    tick: (t, area) => {
      const y = Math.sin(t / 800) * 2 + Math.sin(t / 300) * 0.5;
      cache.push("area", t, y);
      area.push({ t, y });
      return 1;
    },
  });

  const { chartRef, state } = useFluxionCrosshair({
    host,
    cache,
    xMode: "time",
    timeWindowMs: localWindowMs,
    timeOrigin,
    yPadPx: Y_PAD_PX,
    xFormat: (t) => new Date(timeOrigin + t).toISOString().slice(11, 23),
    yFormat: (y) => y.toFixed(4),
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
          <WindowSelector value={localWindowMs} onChange={setLocalWindowMs} options={WINDOW_OPTIONS} />
        </div>
        <span>{hz} Hz · {localWindowMs / 1000}s window</span>
      </div>
    </div>
  );
}
