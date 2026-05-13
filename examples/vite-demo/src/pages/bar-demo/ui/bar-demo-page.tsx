import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  barLayer,
  FluxionCanvas,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const LABELS = ["CPU", "Mem", "GPU", "Net", "Disk", "I/O", "Cache", "Swap"];
const BAR_COUNT = LABELS.length;

function randomValues(): number[] {
  return Array.from({ length: BAR_COUNT }, () => Math.random() * 100);
}

export function BarDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const barHandleRef = useRef<ReturnType<FluxionHost["bar"]> | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "fixed",
        xRange: [-0.5, BAR_COUNT - 0.5],
        yMode: "fixed",
        yRange: [0, 110],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 8,
      }),
      barLayer("bar", {
        color: "#34d399",
        barWidth: 28,
        layout: "y",
        xRange: [0, BAR_COUNT - 1],
      }),
    ],
    [],
  );

  useLayerConfig(host, axisGridLayer("axis", {}));

  useEffect(() => {
    if (!host) return;
    barHandleRef.current = host.bar("bar");
    // Push initial data immediately.
    barHandleRef.current.setY(randomValues());

    const id = setInterval(() => {
      barHandleRef.current?.setY(randomValues());
    }, 800);
    return () => clearInterval(id);
  }, [host]);

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
      {/* X-axis labels rendered in DOM since bar x-positions are category-based */}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-around",
          fontSize: 11,
          color: THEME.page.textSecondary,
          paddingInline: 14,
          pointerEvents: "none",
        }}
      >
        {LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          fontSize: 12,
          color: THEME.page.textSecondary,
        }}
      >
        random system metrics · updates every 800ms
      </div>
    </div>
  );
}
