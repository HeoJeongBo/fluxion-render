import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  occupancyGridLayer,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const COLS = 40;
const ROWS = 30;
const RES = 0.25; // meters per cell

// A ROS-style occupancy grid: a static map with a sweeping "sensor" arc that
// re-reveals unknown cells as occupied/free over time.
export function OccupancyGridDemoPage() {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "fixed",
        xRange: [0, COLS * RES],
        yMode: "fixed",
        yRange: [0, ROWS * RES],
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        yPadPx: 8,
      }),
      occupancyGridLayer("map", { showGridLines: false }),
    ],
    [],
  );

  useEffect(() => {
    if (!host) return;
    const grid = host.occupancyGrid("map");
    // Base map: a ring of walls, interior unknown.
    const base = new Float32Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const edge = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
        base[r * COLS + c] = edge ? 100 : -1; // wall vs unknown
      }
    }
    let sweep = 0;
    const id = setInterval(() => {
      sweep = (sweep + 1) % COLS;
      const cells = base.slice();
      // Reveal a vertical column as free, with a couple of obstacles.
      for (let r = 1; r < ROWS - 1; r++) {
        const obstacle = (r === 10 || r === 20) && sweep > 8 && sweep < 32;
        cells[r * COLS + sweep] = obstacle ? 90 : 5;
      }
      grid.setGrid({
        originX: 0,
        originY: 0,
        resolution: RES,
        cols: COLS,
        rows: ROWS,
        cells,
      });
    }, 120);
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
      <span style={hud}>occupancyGridLayer · unknown=grey, free→occupied</span>
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
