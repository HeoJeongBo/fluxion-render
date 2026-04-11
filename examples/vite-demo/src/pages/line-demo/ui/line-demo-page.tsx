import type { LineSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  lineLayer,
  useFluxionCanvas,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import {
  type Float32StampedMessage,
  generateFloat32StampedMessage,
  stampToMs,
} from "../../../shared/lib/test-data";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 120;
const DEFAULT_WINDOW_MS = 5000;

/**
 * User-owned transform: ROS2 Float32Stamped message → library `LineSample`.
 *
 * This is the "bring your own subscriber" pattern — the demo receives raw
 * message objects as if from rclnodejs / roslib and converts them inline.
 * Declared at module scope so React doesn't recreate the closure on every
 * render.
 */
const transform = (msg: Float32StampedMessage): LineSample => ({
  t: stampToMs(msg.header),
  y: msg.data,
});

export interface LineDemoPageProps {
  /** Controlled window width. If omitted, demo owns its own state + selector. */
  windowMs?: number;
  /** Hide the internal window selector (combined view uses a shared one). */
  hideSelector?: boolean;
  /** Hide the HUD line. Useful inside the combined view. */
  compactHud?: boolean;
}

export function LineDemoPage({
  windowMs: windowProp,
  hideSelector = false,
  compactHud = false,
}: LineDemoPageProps = {}) {
  const [localWindowMs, setLocalWindowMs] = useState(DEFAULT_WINDOW_MS);
  const windowMs = windowProp ?? localWindowMs;

  // Stable wall-clock origin once per mount so HH:mm:ss labels match real time.
  const timeOrigin = useMemo(() => Date.now(), []);

  const { containerRef, host } = useFluxionCanvas({
    layers: [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss.SSS",
        yMode: "auto",
      }),
      lineLayer("line", { color: "#4fc3f7", lineWidth: 1.5, capacity: 8192 }),
    ],
  });

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: windowMs }));

  const { rate: hz } = useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.line("line"),
    tick: (t, line) => {
      // Simulate a ROS2 subscriber callback firing with a fresh message.
      const msg = generateFloat32StampedMessage(t);
      line.push(transform(msg));
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
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: compactHud ? 11 : 12,
          color: "#9ad",
        }}
      >
        {!hideSelector && (
          <WindowSelector
            value={windowMs}
            onChange={setLocalWindowMs}
            compact={compactHud}
          />
        )}
        <span>
          {hz} Hz · {windowMs / 1000}s window
          {!compactHud && ` · target ${TARGET_HZ} Hz`}
        </span>
      </div>
    </div>
  );
}
