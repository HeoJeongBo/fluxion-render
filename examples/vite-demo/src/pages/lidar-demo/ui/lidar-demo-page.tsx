import {
  axisGridLayer,
  lidarLayer,
  useFluxionCanvas,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import {
  generateLaserScanMessage,
  type LaserScanMessage,
} from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 120;
const POINTS_PER_SCAN = 30_000;
const RANGE_MAX = 40;
const STRIDE = 4;

/**
 * User-owned transform: ROS2 `sensor_msgs/LaserScan` → stride-4 Float32Array
 * that the LiDAR layer consumes.
 *
 * Allocates a fresh buffer per call on purpose — `pushRaw` requires
 * `byteOffset === 0` (subarrays into a shared pool would be rejected by
 * `FluxionHost.pushData`). For 30k points at 120Hz this is ~57 MB/s of
 * short-lived Float32Array allocations; V8 handles that comfortably.
 *
 * Declared at module scope so React doesn't recreate the closure per render.
 */
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

/**
 * Simulates a rotating 2D LiDAR publishing 30k-point `LaserScan` messages
 * at ~120Hz. Each frame the mock subscriber delivers a fresh message, the
 * user-owned `transform` converts it to a stride-4 Float32Array, and the
 * typed handle pushes it zero-copy to the worker.
 *
 * y-axis stays fixed here — LiDAR points live in a cartesian plane, not a
 * time series, so auto y-fit would warp the geometry.
 */
export function LidarDemoPage({ compactHud = false }: LidarDemoPageProps = {}) {
  const { containerRef, host } = useFluxionCanvas({
    hostOptions: { bgColor: THEME.chart.canvasBg },
    layers: [
      axisGridLayer("axis", {
        xRange: [-RANGE_MAX, RANGE_MAX],
        yRange: [-RANGE_MAX, RANGE_MAX],
        showXGrid: false,
        showXLabels: false,
        showYGrid: false,
        showAxes: false,
        showYLabels: false,
      }),
      lidarLayer("lidar", { stride: STRIDE, pointSize: 2, intensityMax: 1 }),
    ],
  });

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => ({ cloud: h.lidar("lidar", STRIDE), frame: { value: 0 } }),
    tick: (_t, state) => {
      // Mock a ROS2 LaserScan subscriber callback.
      const msg = generateLaserScanMessage(state.frame.value++, POINTS_PER_SCAN, {
        rangeMax: RANGE_MAX,
      });
      state.cloud.pushRaw(transform(msg));
      return 1;
    },
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
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
