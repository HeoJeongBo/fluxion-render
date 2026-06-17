import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  boxPlotLayer,
  FluxionCanvas,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const JOINTS = ["J1", "J2", "J3", "J4", "J5", "J6"];

function quantiles(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.floor(q * (s.length - 1))]!;
  return {
    min: s[0]!,
    q1: at(0.25),
    median: at(0.5),
    q3: at(0.75),
    max: s[s.length - 1]!,
  };
}

// Per-joint torque distribution as a box plot, recomputed each tick from a
// fresh sample window — distributions shift so the boxes breathe.
export function BoxPlotDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "fixed",
        xRange: [-0.5, JOINTS.length - 0.5],
        yMode: "fixed",
        yRange: [-100, 100],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        yPadPx: 8,
      }),
      boxPlotLayer("torque", { color: "#4fc3f7", boxWidth: 36 }),
    ],
    [],
  );

  useEffect(() => {
    if (!host) return;
    const bp = host.boxPlot("torque");
    let phase = 0;
    const push = () => {
      phase += 0.2;
      const boxes = JOINTS.map((_, i) => {
        const center = 30 * Math.sin(phase + i);
        const spread = 20 + 10 * Math.random();
        const samples = Array.from(
          { length: 200 },
          () => center + (Math.random() - 0.5) * 2 * spread,
        );
        return { x: i, ...quantiles(samples) };
      });
      bp.setBoxes(boxes);
    };
    push();
    const id = setInterval(push, 700);
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
      <div style={labelRow}>
        {JOINTS.map((j) => (
          <span key={j}>{j}</span>
        ))}
      </div>
      <span style={hud}>boxPlotLayer · per-joint torque quartiles</span>
    </div>
  );
}

const labelRow = {
  position: "absolute" as const,
  bottom: 4,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-around",
  fontSize: 11,
  color: THEME.page.textSecondary,
  paddingInline: 14,
  pointerEvents: "none" as const,
};

const hud = {
  position: "absolute" as const,
  top: 8,
  right: 12,
  fontSize: 12,
  color: THEME.page.textSecondary,
  pointerEvents: "none" as const,
};
