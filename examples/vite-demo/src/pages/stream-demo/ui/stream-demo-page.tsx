import { useFluxionCanvas } from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useState } from "react";
import { createTimeOrigin, generateStreamBatch } from "../../../shared/lib/test-data";
import { WindowSelector } from "../../../shared/ui/window-selector";

const BATCH_HZ = 60;
const SAMPLES_PER_BATCH = 20; // 1200 samples/sec per series
const DT_MS = 1000 / (BATCH_HZ * SAMPLES_PER_BATCH);
const DEFAULT_WINDOW_MS = 3000;

const SERIES = [
  { id: "s1", color: "#4fc3f7", freqHz: 0.8, amplitude: 0.9, offset: 0 },
  { id: "s2", color: "#80ffa0", freqHz: 1.3, amplitude: 0.7, offset: 1.1 },
  { id: "s3", color: "#ffb060", freqHz: 2.1, amplitude: 0.5, offset: 2.2 },
];

export interface StreamDemoPageProps {
  windowMs?: number;
  hideSelector?: boolean;
  compactHud?: boolean;
}

export function StreamDemoPage({
  windowMs: windowProp,
  hideSelector = false,
  compactHud = false,
}: StreamDemoPageProps = {}) {
  const [localWindowMs, setLocalWindowMs] = useState(DEFAULT_WINDOW_MS);
  const windowMs = windowProp ?? localWindowMs;
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
          yRange: [-2, 2],
        },
      },
      ...SERIES.map((s) => ({
        id: s.id,
        kind: "line" as const,
        config: { color: s.color, lineWidth: 1.25, capacity: 8192 },
      })),
    ],
  });

  useEffect(() => {
    if (!host) return;
    host.configLayer("axis", { timeWindowMs: windowMs });
  }, [host, windowMs]);

  const [rate, setRate] = useState(0);

  useEffect(() => {
    if (!host) return;
    // Resolve a typed handle per series once.
    const handles = SERIES.map((s) => ({ spec: s, handle: host.line(s.id) }));
    const t = createTimeOrigin();
    let pushes = 0;
    let lastReport = performance.now();

    const interval = setInterval(() => {
      const tStart = t();
      for (const { spec, handle } of handles) {
        const batch = generateStreamBatch(tStart, SAMPLES_PER_BATCH, DT_MS, {
          freqHz: spec.freqHz,
          amplitude: spec.amplitude,
          seriesOffset: spec.offset,
        });
        handle.pushBatch(batch);
      }
      pushes += SAMPLES_PER_BATCH * SERIES.length;
      const wall = performance.now();
      if (wall - lastReport >= 500) {
        setRate(Math.round((pushes * 1000) / (wall - lastReport)));
        pushes = 0;
        lastReport = wall;
      }
    }, 1000 / BATCH_HZ);

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
          {rate} samples/s · {SERIES.length} series · {windowMs / 1000}s
        </span>
      </div>
    </div>
  );
}
