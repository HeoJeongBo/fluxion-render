import type { FluxionHost } from "@heojeongbo/fluxion-render";
import type { HeatmapPoint } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  heatmapLayer,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const COLS = 40;
const ROWS = 30;

type Colormap = "viridis" | "plasma" | "hot";

function buildGrid(t: number): HeatmapPoint[] {
  const pts: HeatmapPoint[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c;
      const y = r;
      const value =
        Math.sin((c / COLS) * Math.PI * 2 + t / 1000) *
        Math.cos((r / ROWS) * Math.PI * 2 + t / 800);
      pts.push({ x, y, value });
    }
  }
  return pts;
}

export function HeatmapDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [colormap, setColormap] = useState<Colormap>("viridis");
  const heatHandleRef = useRef<ReturnType<FluxionHost["heatmap"]> | null>(null);
  const colormapRef = useRef(colormap);
  colormapRef.current = colormap;

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "fixed",
        xRange: [-1, COLS],
        yMode: "fixed",
        yRange: [-1, ROWS],
        showXLabels: false,
        showYLabels: false,
        showXGrid: false,
        showYGrid: false,
        axisColor: "transparent",
      }),
      heatmapLayer("heat", {
        cellWidth: 14,
        cellHeight: 14,
        minValue: -1,
        maxValue: 1,
        colormap,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!host) return;
    heatHandleRef.current = host.heatmap("heat");

    let animId: number;
    function frame() {
      heatHandleRef.current?.setGrid(buildGrid(Date.now()));
      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [host]);

  // Update colormap config when changed.
  useEffect(() => {
    if (!host) return;
    host.configLayer("heat", { colormap });
  }, [host, colormap]);

  const CMAPS: Colormap[] = ["viridis", "plasma", "hot"];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        axisLayerId="axis"
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
          gap: 6,
          fontSize: 12,
          color: THEME.page.textSecondary,
        }}
      >
        {CMAPS.map((cm) => (
          <button
            key={cm}
            onClick={() => setColormap(cm)}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              border: `1px solid ${cm === colormap ? THEME.button.border : THEME.page.border}`,
              borderRadius: 4,
              background: cm === colormap ? THEME.button.background : THEME.button.inactiveBackground,
              color: cm === colormap ? THEME.button.text : THEME.button.inactiveText,
              cursor: "pointer",
            }}
          >
            {cm}
          </button>
        ))}
        <span>· {COLS}×{ROWS} sine wave</span>
      </div>
    </div>
  );
}
