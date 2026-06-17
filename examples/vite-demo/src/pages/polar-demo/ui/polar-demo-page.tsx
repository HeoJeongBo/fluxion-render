import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { FluxionCanvas, polarLayer } from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const BEAMS = 180;

// A simulated single-line LiDAR scan: range per angle, refreshed continuously.
// The polar layer maps (theta, r) around the canvas center with grid rings.
export function PolarDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);

  // polar is self-contained — it does not use axis-grid bounds.
  const layers = useMemo(
    () => [
      polarLayer("scan", {
        color: "#4fc3f7",
        fillOpacity: 0.15,
        rMax: 1,
        showPoints: false,
        showRings: true,
        ringCount: 4,
      }),
    ],
    [],
  );

  useEffect(() => {
    if (!host) return;
    const scan = host.polar("scan");
    let phase = 0;
    const id = setInterval(() => {
      phase += 0.05;
      const points = Array.from({ length: BEAMS }, (_, i) => {
        const theta = (i / BEAMS) * Math.PI * 2;
        // A room-like profile with a moving obstacle.
        const base = 0.7 + 0.2 * Math.sin(theta * 4 + phase);
        const obstacle = Math.abs(theta - (phase % (Math.PI * 2))) < 0.2 ? -0.35 : 0;
        return { theta, r: Math.max(0.05, base + obstacle) };
      });
      scan.setPoints(points);
    }, 1000 / 30);
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
      <span style={hud}>polarLayer · 180-beam LiDAR scan</span>
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
