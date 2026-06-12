import type { FluxionHost, MarkerEvent } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  eventMarkerLayer,
  FluxionCanvas,
  lineLayer,
  useFluxionStream,
  useLayerConfig,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useRef, useState } from "react";
import { generateFloat32StampedMessage, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

export function EventMarkerDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [events, setEvents] = useState<MarkerEvent[]>([]);
  const eventsRef = useRef<MarkerEvent[]>([]);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        xTickFormat: "HH:mm:ss.SSS",
        xTickIntervalMs: 1000,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 12,
      }),
      lineLayer("line", {
        color: "#4fc3f7",
        lineWidth: 2,
        retentionMs: 10_000,
        maxHz: TARGET_HZ,
      }),
      eventMarkerLayer("markers"),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", { timeWindowMs: DEFAULT_WINDOW_MS }));

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.line("line"),
    tick: (t, line) => {
      const msg = generateFloat32StampedMessage(t);
      line.push({ t: stampToMs(msg.header), y: msg.data });
      return 1;
    },
  });

  const markerHandle = useMemo(() => host?.eventMarker("markers") ?? null, [host]);

  const addMarker = (severity: 0 | 1 | 2) => {
    const t = Date.now() - timeOrigin;
    const next: MarkerEvent[] = [...eventsRef.current, { t, severity }];
    eventsRef.current = next;
    setEvents(next);
    markerHandle?.setEvents(next);
  };

  const severityLabel = ["INFO", "WARN", "ERROR"];
  const severityColor = ["#4caf50", "#ffb060", "#ff5252"];

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
      <div
        style={{
          padding: "8px 12px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          borderBottom: `1px solid ${THEME.page.border}`,
        }}
      >
        <span style={{ fontSize: 13, color: THEME.page.textSecondary, marginRight: 4 }}>
          Add marker:
        </span>
        {([0, 1, 2] as const).map((sev) => (
          <button
            key={sev}
            onClick={() => addMarker(sev)}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              background: severityColor[sev],
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {severityLabel[sev]}
          </button>
        ))}
        <span style={{ fontSize: 12, color: THEME.page.textMuted, marginLeft: 8 }}>
          {events.length} marker{events.length !== 1 ? "s" : ""} placed
        </span>
        {events.length > 0 && (
          <button
            onClick={() => {
              eventsRef.current = [];
              setEvents([]);
              markerHandle?.clearEvents();
            }}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              background: "transparent",
              color: THEME.page.textSecondary,
              border: `1px solid ${THEME.page.border}`,
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
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
      </div>
    </div>
  );
}
