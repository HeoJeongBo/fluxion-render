import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  FluxionCanvas,
  FluxionCrosshair,
  HoverDataCache,
  axisGridLayer,
  lineLayer,
  useFluxionCrosshair,
  useFluxionStream,
  useLayerConfig,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useState } from "react";
import {
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

const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;
const Y_PAD_PX = 8;

const SERIES = [
  { id: "s1", label: "Sensor A", color: "#4fc3f7", freqHz: 0.8, amplitude: 0.9, offset: 0 },
  { id: "s2", label: "Sensor B", color: "#80ffa0", freqHz: 1.3, amplitude: 0.7, offset: 1.1 },
  { id: "s3", label: "Sensor C", color: "#ffb060", freqHz: 2.1, amplitude: 0.5, offset: 2.2 },
];

export function CrosshairDemoPage() {
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);

  // Data cache — mirrors what we push to the Worker
  const cache = useMemo(() => {
    const c = new HoverDataCache();
    for (const s of SERIES) {
      c.registerLayer(s.id, { capacity: RING_CAPACITY, label: s.label, color: s.color });
    }
    return c;
  }, []);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss",
        xTickIntervalMs: 1000,
        yMode: "auto",
        yPadPx: Y_PAD_PX,
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
      }),
      ...SERIES.map((s) =>
        lineLayer(s.id, { color: s.color, lineWidth: 1.5, capacity: RING_CAPACITY }),
      ),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: windowMs }));

  // Push data: cache first (values copied), then handle (buffer transferred)
  useFluxionStream({
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
        for (const msg of msgs) {
          cache.push(spec.id, stampToMs(msg.header), msg.data);
        }
        handle.pushBatch(msgs.map((m) => ({ t: stampToMs(m.header), y: m.data })));
      }
      return SAMPLES_PER_BATCH * SERIES.length;
    },
  });

  const { chartRef, state } = useFluxionCrosshair({
    host,
    cache,
    xMode: "time",
    timeWindowMs: windowMs,
    timeOrigin,
    yPadPx: Y_PAD_PX,
    xFormat: (t) => new Date(timeOrigin + t).toISOString().slice(11, 23),
    yFormat: (y) => y.toFixed(4),
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        yAxisWidth={Y_AXIS_WIDTH}
        xAxisHeight={X_AXIS_HEIGHT}
        axisColor={THEME.chart.labelColor}
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />

      {/* Transparent overlay for mouse event capture */}
      <div
        ref={chartRef}
        style={{
          position: "absolute",
          top: 0,
          left: Y_AXIS_WIDTH,
          right: 0,
          bottom: X_AXIS_HEIGHT,
          pointerEvents: "auto",
          cursor: state.position ? "crosshair" : "default",
        }}
      />

      {/* Crosshair + tooltip */}
      <FluxionCrosshair
        state={state}
        lineColor="rgba(200,220,255,0.5)"
        tooltipBg="rgba(12,16,28,0.94)"
        tooltipColor="#e2e8f0"
        style={{
          position: "absolute",
          top: 0,
          left: Y_AXIS_WIDTH,
          right: 0,
          bottom: X_AXIS_HEIGHT,
        }}
      />

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: Y_AXIS_WIDTH + 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "6px 10px",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(4px)",
          borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.08)",
          fontSize: 11,
          pointerEvents: "none",
        }}
      >
        {SERIES.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: s.color,
              }}
            />
            <span style={{ color: THEME.page.textPrimary }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Window selector */}
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
      </div>
    </div>
  );
}
