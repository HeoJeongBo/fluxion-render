import { useFluxionCanvas } from "@heojeongbo/fluxion-render/react";
import { useEffect, useState } from "react";
import { generateLidarScan } from "../../../shared/lib/test-data";

const TARGET_HZ = 120;
const POINTS_PER_SCAN = 30_000;
const RANGE_MAX = 40;

export interface LidarDemoPageProps {
  compactHud?: boolean;
}

/**
 * Simulates a rotating 2D LiDAR publishing 30k points at ~120Hz. Each frame
 * allocates a fresh Float32Array so the worker gets an owning transfer.
 * Renderer side uses counting-sort batching so 30k points draw in one path
 * per color bucket.
 */
export function LidarDemoPage({ compactHud = false }: LidarDemoPageProps = {}) {
  const { containerRef, host } = useFluxionCanvas({
    layers: [
      {
        id: "axis",
        kind: "axis-grid",
        config: {
          xRange: [-RANGE_MAX, RANGE_MAX],
          yRange: [-RANGE_MAX, RANGE_MAX],
        },
      },
      {
        id: "lidar",
        kind: "lidar",
        config: { stride: 4, pointSize: 2, intensityMax: 1 },
      },
    ],
  });

  const [hz, setHz] = useState(0);

  useEffect(() => {
    if (!host) return;
    let frame = 0;
    let pushes = 0;
    let lastReport = performance.now();

    const cloud = host.lidar("lidar", 4);
    const interval = setInterval(() => {
      // 30k × 120Hz — hot path: use pushRaw so we skip object-to-array encoding.
      cloud.pushRaw(generateLidarScan(frame, POINTS_PER_SCAN, { rangeMax: RANGE_MAX }));
      frame++;
      pushes++;
      const wall = performance.now();
      if (wall - lastReport >= 500) {
        setHz(Math.round((pushes * 1000) / (wall - lastReport)));
        pushes = 0;
        lastReport = wall;
      }
    }, 1000 / TARGET_HZ);

    return () => clearInterval(interval);
  }, [host]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          fontSize: compactHud ? 11 : 12,
          color: "#9ad",
        }}
      >
        {hz} Hz · {POINTS_PER_SCAN.toLocaleString()} pts
        {!compactHud && ` · target ${TARGET_HZ} Hz`}
      </div>
    </div>
  );
}
