import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  trajectoryLayer,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

// A robot driving a looping Lissajous path in world (x, y) space. The
// trajectory layer colors the path by sample age and marks the current pose.
export function TrajectoryDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "fixed",
        xRange: [-1.2, 1.2],
        yMode: "fixed",
        yRange: [-1.2, 1.2],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        yPadPx: 8,
      }),
      trajectoryLayer("path", {
        colorByTime: true,
        colormap: "viridis",
        headMarker: true,
        headMarkerSize: 5,
        fadeOlderMs: 8000,
        retentionMs: 8000,
        maxHz: 60,
      }),
    ],
    [],
  );

  useEffect(() => {
    if (!host) return;
    const path = host.trajectory("path");
    const t0 = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - t0;
      const a = t / 1000;
      path.push({ x: Math.sin(a * 1.1), y: Math.sin(a * 1.7) * 0.9, t });
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [host]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
        style={{ width: "100%", height: "100%" }}
      />
      <span style={hud}>trajectoryLayer · colorByTime + fade + head marker</span>
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
