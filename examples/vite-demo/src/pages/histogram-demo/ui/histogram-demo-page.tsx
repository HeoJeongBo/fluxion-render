import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  histogramLayer,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const RANGE: [number, number] = [-4, 4];

// A live histogram of a noisy sensor signal — 2000 fresh Gaussian-ish samples
// re-binned every 500 ms.
export function HistogramDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "fixed",
        xRange: RANGE,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        yPadPx: 8,
      }),
      histogramLayer("hist", { binCount: 40, range: RANGE, color: "#b388ff", gapPx: 1 }),
    ],
    [],
  );

  useEffect(() => {
    if (!host) return;
    const hist = host.histogram("hist");
    const sample = () => {
      // sum of uniforms → approximately normal
      let s = 0;
      for (let i = 0; i < 6; i++) s += Math.random();
      return (s - 3) * 1.3;
    };
    const push = () => hist.setValues(Array.from({ length: 2000 }, sample));
    push();
    const id = setInterval(push, 500);
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
      <span style={hud}>histogramLayer · 40 bins, re-binned every 500ms</span>
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
