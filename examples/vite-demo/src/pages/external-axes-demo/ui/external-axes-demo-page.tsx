import type { FluxionHost, LineSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
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
const SAMPLES_PER_BATCH = 20;
const DT_MS = 1000 / (BATCH_HZ * SAMPLES_PER_BATCH);
const DEFAULT_WINDOW_MS = 3000;
const MAX_WINDOW_MS = 60_000;
const SAMPLES_PER_SEC = BATCH_HZ * SAMPLES_PER_BATCH;
const RING_CAPACITY = Math.ceil((MAX_WINDOW_MS / 1000) * SAMPLES_PER_SEC * 1.2);

const SERIES = [
  { id: "s1", color: "#4fc3f7", freqHz: 0.8, amplitude: 0.9, offset: 0 },
  { id: "s2", color: "#80ffa0", freqHz: 1.3, amplitude: 0.7, offset: 1.1 },
  { id: "s3", color: "#ffb060", freqHz: 2.1, amplitude: 0.5, offset: 2.2 },
];

const transformBatch = (msgs: Float32StampedMessage[]): LineSample[] =>
  msgs.map((m) => ({ t: stampToMs(m.header), y: m.data }));

export function ExternalAxesDemoPage() {
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);
  const [host, setHost] = useState<FluxionHost | null>(null);
  const timeOrigin = useMemo(() => Date.now(), []);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss",
        yMode: "auto",
        showXLabels: false,
        showYLabels: false,
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
      }),
      ...SERIES.map((s) =>
        lineLayer(s.id, {
          color: s.color,
          lineWidth: 1.25,
          capacity: RING_CAPACITY,
        }),
      ),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: windowMs }));

  const { rate } = useFluxionStream({
    host,
    intervalMs: 1000 / BATCH_HZ,
    setup: (h) => SERIES.map((s) => ({ spec: s, handle: h.line(s.id) })),
    tick: (t, handles) => {
      for (const { spec, handle } of handles) {
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
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        yAxisWidth={52}
        xAxisHeight={20}
        axisColor={THEME.chart.labelColor}
        axisFont="10px sans-serif"
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
          gap: 8,
          fontSize: 12,
          color: THEME.page.textSecondary,
        }}
      >
        <WindowSelector value={windowMs} onChange={setWindowMs} />
        <span>
          {rate} samples/s · {SERIES.length} series · {windowMs / 1000}s
        </span>
      </div>
    </div>
  );
}
