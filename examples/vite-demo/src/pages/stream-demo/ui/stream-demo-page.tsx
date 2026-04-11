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
  generateFloat32StampedBatch,
  stampToMs,
} from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";

const BATCH_HZ = 60;
const SAMPLES_PER_BATCH = 20; // 1200 samples/sec per series
const DT_MS = 1000 / (BATCH_HZ * SAMPLES_PER_BATCH);
const DEFAULT_WINDOW_MS = 3000;
const MAX_WINDOW_MS = 60_000; // longest option in the WindowSelector
const SAMPLES_PER_SEC = BATCH_HZ * SAMPLES_PER_BATCH; // 1200/s per series
// Ring buffer must cover the longest selectable window so the chart isn't
// truncated when the user picks 30s/60s. Add 20% headroom for jitter.
const RING_CAPACITY = Math.ceil((MAX_WINDOW_MS / 1000) * SAMPLES_PER_SEC * 1.2);

const SERIES = [
  { id: "s1", color: "#4fc3f7", freqHz: 0.8, amplitude: 0.9, offset: 0 },
  { id: "s2", color: "#80ffa0", freqHz: 1.3, amplitude: 0.7, offset: 1.1 },
  { id: "s3", color: "#ffb060", freqHz: 2.1, amplitude: 0.5, offset: 2.2 },
];

/**
 * User-owned batch transform: ROS2 Float32Stamped[] → library `LineSample[]`.
 * Applied to every batched subscriber delivery before the handle pushes it.
 */
const transformBatch = (msgs: Float32StampedMessage[]): LineSample[] =>
  msgs.map((m) => ({ t: stampToMs(m.header), y: m.data }));

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
    hostOptions: { bgColor: THEME.chart.canvasBg },
    layers: [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss",
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        labelColor: THEME.chart.labelColor,
      }),
      ...SERIES.map((s) =>
        lineLayer(s.id, {
          color: s.color,
          lineWidth: 1.25,
          capacity: RING_CAPACITY,
        }),
      ),
    ],
  });

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: windowMs }));

  const { rate } = useFluxionStream({
    host,
    intervalMs: 1000 / BATCH_HZ,
    setup: (h) => SERIES.map((s) => ({ spec: s, handle: h.line(s.id) })),
    tick: (t, handles) => {
      for (const { spec, handle } of handles) {
        // Mock a batched ROS2 subscriber: one message burst per series.
        const msgs = generateFloat32StampedBatch(t, SAMPLES_PER_BATCH, DT_MS, {
          freqHz: spec.freqHz,
          amplitude: spec.amplitude,
          seriesOffset: spec.offset,
        });
        handle.pushBatch(transformBatch(msgs));
      }
      return SAMPLES_PER_BATCH * SERIES.length;
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
          color: THEME.page.textSecondary,
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
