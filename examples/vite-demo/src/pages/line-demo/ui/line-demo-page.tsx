import type { LineSample } from "@heojeongbo/fluxion-render";
import { useFluxionCanvas } from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { createTimeOrigin, generateStreamSample } from "../../../shared/lib/test-data";
import { WindowSelector } from "../../../shared/ui/window-selector";

const TARGET_HZ = 120;
const DEFAULT_WINDOW_MS = 5000;

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

  // Establish a stable wall-clock origin once per mount so HH:mm:ss labels
  // line up with real time.
  const timeOrigin = useMemo(() => Date.now(), []);

  const { containerRef, host } = useFluxionCanvas({
    layers: [
      {
        id: "axis",
        kind: "axis-grid",
        config: {
          xMode: "time",
          timeWindowMs: DEFAULT_WINDOW_MS,
          timeOrigin,
          xTickFormat: "HH:mm:ss.SSS",
          yRange: [-2, 2],
        },
      },
      {
        id: "line",
        kind: "line",
        config: {
          color: "#4fc3f7",
          lineWidth: 1.5,
          capacity: 8192,
        },
      },
    ],
  });

  // Live-update axis window whenever the user (or parent) picks a new value.
  useEffect(() => {
    if (!host) return;
    host.configLayer("axis", { timeWindowMs: windowMs });
  }, [host, windowMs]);

  const [hz, setHz] = useState(0);

  useEffect(() => {
    if (!host) return;
    const line = host.line("line"); // typed handle, structured { t, y }
    const t = createTimeOrigin();
    let pushes = 0;
    let lastReport = performance.now();

    const interval = setInterval(() => {
      const now = t();
      const sample: LineSample = generateStreamSample(now);
      line.push(sample);
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
