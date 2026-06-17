import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionLegend,
  stackedAreaLayer,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const CORES = ["core 0", "core 1", "core 2", "core 3"];
const COLORS = ["#4fc3f7", "#80ffa0", "#ffb060", "#ff5252"];

// Per-core CPU load stacked so the top edge is total utilisation.
export function StackedAreaDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const timeOrigin = useTimeOrigin();

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 6000,
        timeOrigin,
        xTickFormat: "HH:mm:ss",
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        yPadPx: 8,
      }),
      stackedAreaLayer("cpu", {
        seriesCount: CORES.length,
        colors: COLORS,
        fillOpacity: 0.8,
        retentionMs: 6000,
        maxHz: 30,
      }),
    ],
    [timeOrigin],
  );

  useEffect(() => {
    if (!host) return;
    const cpu = host.stackedArea("cpu");
    const id = setInterval(() => {
      const t = Date.now() - timeOrigin;
      const values = CORES.map((_, i) => 10 + 15 * (1 + Math.sin(t / 900 + i * 1.3)));
      cpu.push({ t, values });
    }, 1000 / 30);
    return () => clearInterval(id);
  }, [host, timeOrigin]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
        style={{ width: "100%", height: "100%" }}
      />
      <FluxionLegend
        items={CORES.map((label, i) => ({ color: COLORS[i]!, label }))}
        position="top-left"
      />
      <span style={hud}>stackedAreaLayer · total = sum of cores</span>
    </div>
  );
}

const hud = {
  position: "absolute" as const,
  top: 8,
  right: 12,
  fontSize: 12,
  color: THEME.page.textSecondary,
  pointerEvents: "none" as const,
};
