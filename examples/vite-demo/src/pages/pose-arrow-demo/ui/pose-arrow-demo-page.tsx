import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  poseArrowLayer,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useRef, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 20;
const DEFAULT_WINDOW_MS = 10_000;

export function PoseArrowDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const phaseRef = useRef(0);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        yMode: "fixed",
        yRange: [-1.2, 1.2],
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: true,
        yPadPx: 8,
      }),
      lineLayer("path", {
        color: "rgba(128,255,160,0.25)",
        lineWidth: 1,
        retentionMs: 12_000,
        maxHz: TARGET_HZ,
      }),
      poseArrowLayer("pose", {
        arrowLength: 14,
        arrowWidth: 5,
        color: "#80ffa0",
        retentionMs: 12_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin],
  );

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => {
      const pose = h.poseArrow("pose");
      const path = h.line("path");
      return { pose, path };
    },
    tick: (t, { pose, path }) => {
      phaseRef.current += (2 * Math.PI) / (TARGET_HZ * 6); // full circle every 6 s
      const phase = phaseRef.current;

      // Robot moves along a sine wave; heading = tangent direction
      const y = Math.sin(phase);
      const dy = Math.cos(phase); // derivative of sin(phase) w.r.t. phase
      // theta: 0=right (positive t direction). Use atan2 with a fixed dx
      // component to encode the heading relative to the time axis.
      const theta = Math.atan2(-dy * 0.15, 1); // negative: canvas y is inverted

      pose.push({ t, y, theta });
      path.push({ t, y });
      return 1;
    },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: THEME.page.background,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 16px 8px",
          flexShrink: 0,
          borderBottom: `1px solid ${THEME.page.border}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.page.textPrimary }}>
          Pose Arrow — Robot Heading Visualization
        </div>
        <div style={{ fontSize: 11, color: THEME.page.textMuted, marginTop: 2 }}>
          Each arrow shows the robot's y-position and heading angle (θ) at that moment in time
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <FluxionCanvas
          layers={layers}
          hostOptions={{ bgColor: THEME.chart.canvasBg }}
          onReady={setHost}
        />
      </div>

      {/* Legend */}
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${THEME.page.border}`,
          padding: "10px 16px",
          background: THEME.panel.background,
          display: "flex",
          gap: 20,
          alignItems: "center",
          fontSize: 11,
          color: THEME.page.textMuted,
        }}
      >
        {[
          { color: "rgba(128,255,160,0.4)", label: "Path trace" },
          { color: "#80ffa0", label: "Heading arrows (θ = tangent of sine wave)" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 3, background: color, borderRadius: 2 }} />
            <span>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", color: THEME.page.textSecondary, fontSize: 11 }}>
          Rate: {TARGET_HZ} Hz · Window: {DEFAULT_WINDOW_MS / 1000}s
        </div>
      </div>
    </div>
  );
}
