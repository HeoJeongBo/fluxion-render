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
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(SERIES.map((s) => [s.id, true])),
  );

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss",
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
  useLayerConfig(host, lineLayer("s1", { visible: enabled["s1"] }));
  useLayerConfig(host, lineLayer("s2", { visible: enabled["s2"] }));
  useLayerConfig(host, lineLayer("s3", { visible: enabled["s3"] }));

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
        axisConfig={{ timeWindowMs: windowMs }}
        axisColor={THEME.chart.labelColor}
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: "6px 10px",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(4px)",
          borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.08)",
          fontSize: 11,
        }}
      >
        {SERIES.map((s) => (
          <label
            key={s.id}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
          >
            <input
              type="checkbox"
              checked={enabled[s.id]}
              onChange={(e) => setEnabled((prev) => ({ ...prev, [s.id]: e.target.checked }))}
              style={{ accentColor: s.color, width: 12, height: 12, cursor: "pointer" }}
            />
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: s.color,
                opacity: enabled[s.id] ? 1 : 0.3,
              }}
            />
            <span style={{ color: enabled[s.id] ? THEME.page.textPrimary : THEME.page.textMuted }}>
              {s.id}
            </span>
          </label>
        ))}
      </div>
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
