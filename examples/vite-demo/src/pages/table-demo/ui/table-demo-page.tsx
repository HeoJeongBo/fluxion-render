import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionTable,
  lineLayer,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  generateFloat32StampedBatch,
  generateFloat32StampedMessage,
  stampToMs,
} from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const DATA_HZ = 120;
const BATCH_HZ = 60;
const SAMPLES_PER_BATCH = DATA_HZ / BATCH_HZ;
const DT_MS = 1000 / DATA_HZ;
const TABLE_UPDATE_HZ = 2;

const SERIES = [
  { id: "a", color: "#4fc3f7", label: "Sensor A", freqHz: 0.5, amplitude: 1.0, offset: 0 },
  { id: "b", color: "#80ffa0", label: "Sensor B", freqHz: 1.1, amplitude: 0.7, offset: 1.2 },
  { id: "c", color: "#ffb060", label: "Sensor C", freqHz: 2.3, amplitude: 0.5, offset: 2.4 },
];

type SensorRow = { id: string; sensor: string; color: string; value: string; time: string };

const COLUMNS: import("@heojeongbo/fluxion-render/react").FluxionTableColumn<SensorRow>[] = [
  {
    key: "sensor",
    header: "Sensor",
    render: (v, row) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: row.color, flexShrink: 0, display: "inline-block",
        }} />
        {String(v)}
      </span>
    ),
  },
  { key: "value", header: "Value" },
  { key: "time", header: "Time (UTC)" },
];

export function TableDemoPage() {
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 5000,
        timeOrigin,
        xTickIntervalMs: 1000,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 8,
      }),
      ...SERIES.map((s) =>
        lineLayer(s.id, { color: s.color, lineWidth: 1.25, retentionMs: 10_000, maxHz: DATA_HZ }),
      ),
    ],
    [timeOrigin],
  );

  // Chart pump (60 Hz batch)
  const { rate } = useFluxionStream({
    host,
    intervalMs: 1000 / BATCH_HZ,
    setup: (h) => SERIES.map((s) => ({ spec: s, handle: h.line(s.id) })),
    tick: (t, handles) => {
      let n = 0;
      for (const { spec, handle } of handles) {
        const msgs = generateFloat32StampedBatch(t, SAMPLES_PER_BATCH, DT_MS, {
          freqHz: spec.freqHz, amplitude: spec.amplitude, seriesOffset: spec.offset,
        });
        handle.pushBatch(msgs.map((m) => ({ t: stampToMs(m.header), y: m.data })));
        n += msgs.length;
      }
      return n;
    },
  });

  // Table pump (120 Hz) — writes to latestRef only, no React state per tick
  const latestRef = useRef<Record<string, SensorRow>>({});
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!host) { t0Ref.current = null; return; }
    const t0 = Date.now();
    t0Ref.current = t0;

    const id = setInterval(() => {
      const t = Date.now() - t0;
      for (const spec of SERIES) {
        const msg = generateFloat32StampedMessage(t + spec.offset * 1000);
        latestRef.current[spec.id] = {
          id: spec.id,
          sensor: spec.label,
          color: spec.color,
          value: msg.data.toFixed(4),
          time: new Date(stampToMs(msg.header) + timeOrigin).toISOString().slice(11, 23),
        };
      }
    }, 1000 / DATA_HZ);

    return () => clearInterval(id);
  }, [host, timeOrigin]);

  // Flush: read latestRef → setState at TABLE_UPDATE_HZ (2 Hz)
  const [sensorRows, setSensorRows] = useState<SensorRow[]>([]);

  useEffect(() => {
    if (!host) { setSensorRows([]); return; }
    const id = setInterval(() => {
      const snapshot = SERIES.map((s) => latestRef.current[s.id]).filter(Boolean) as SensorRow[];
      if (snapshot.length > 0) setSensorRows(snapshot);
    }, 1000 / TABLE_UPDATE_HZ);
    return () => clearInterval(id);
  }, [host]);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", gap: 1, background: THEME.page.border }}>
      {/* 왼쪽: 차트 */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", background: THEME.page.background }}>
        <FluxionCanvas
          externalAxes
          axisLayerId="axis"
          axisColor={THEME.chart.labelColor}
          layers={layers}
          hostOptions={{ bgColor: THEME.chart.canvasBg }}
          onReady={setHost}
        />
        <div style={{ position: "absolute", top: 8, right: 12, fontSize: 11, color: THEME.page.textSecondary }}>
          {rate} samples/s · {SERIES.length} series
        </div>
      </div>

      {/* 오른쪽: 테이블 */}
      <div style={{
        width: 400,
        flexShrink: 0,
        background: THEME.panel.background,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: THEME.page.textPrimary, marginBottom: 2 }}>
            Latest values
          </div>
          <div style={{ fontSize: 11, color: THEME.page.textSecondary }}>
            Updates at {TABLE_UPDATE_HZ} Hz · input {DATA_HZ} Hz
          </div>
        </div>
        <FluxionTable<SensorRow> columns={COLUMNS} rows={sensorRows} />
      </div>
    </div>
  );
}
