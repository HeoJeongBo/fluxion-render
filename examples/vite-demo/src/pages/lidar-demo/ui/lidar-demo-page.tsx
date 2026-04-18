import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lidarLayer,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import {
  generateLaserScanMessage,
  type LaserScanMessage,
} from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 120;
const POINTS_PER_SCAN = 30_000;
const RANGE_MAX = 40;
const STRIDE = 4;

const transform = (msg: LaserScanMessage): Float32Array => {
  const n = msg.ranges.length;
  const out = new Float32Array(n * STRIDE);
  const rangeMax = msg.range_max || 1;
  const hasIntensities = msg.intensities.length === n;
  for (let i = 0; i < n; i++) {
    const r = msg.ranges[i];
    const angle = msg.angle_min + i * msg.angle_increment;
    const o = i * STRIDE;
    out[o] = Math.cos(angle) * r;
    out[o + 1] = Math.sin(angle) * r;
    out[o + 2] = 0;
    out[o + 3] = hasIntensities ? msg.intensities[i] : r / rangeMax;
  }
  return out;
};

export interface LidarDemoPageProps {
  compactHud?: boolean;
}

export function LidarDemoPage({ compactHud = false }: LidarDemoPageProps = {}) {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xRange: [-RANGE_MAX, RANGE_MAX],
        yRange: [-RANGE_MAX, RANGE_MAX],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 8,
        showAxes: true,
      }),
      lidarLayer("lidar", { stride: STRIDE, pointSize: 2, intensityMax: 1 }),
    ],
    [],
  );

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => ({ cloud: h.lidar("lidar", STRIDE), frame: { value: 0 } }),
    tick: (_t, state) => {
      const msg = generateLaserScanMessage(state.frame.value++, POINTS_PER_SCAN, {
        rangeMax: RANGE_MAX,
      });
      state.cloud.pushRaw(transform(msg));
      return 1;
    },
  });

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
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          fontSize: compactHud ? 11 : 12,
          color: THEME.page.textSecondary,
        }}
      >
        {hz} Hz · {POINTS_PER_SCAN.toLocaleString()} pts
        {!compactHud && ` · target ${TARGET_HZ} Hz`}
      </div>
    </div>
  );
}
