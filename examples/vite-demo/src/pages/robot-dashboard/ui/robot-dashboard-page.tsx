import type {
  FluxionHost,
  LineSample,
  MarkerEvent,
  ScatterColoredSample,
} from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  eventMarkerLayer,
  FluxionCanvas,
  FluxionGauge,
  lineLayer,
  scatterColoredLayer,
  useFluxionGauge,
  useFluxionStream,
  useLayerConfig,
  useSyncedTimeWindow,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useRef, useState } from "react";
import { generateFloat32StampedMessage, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;

const GAUGE_THRESHOLDS = [
  { value: 0, color: "#4caf50" },
  { value: 60, color: "#ffb060" },
  { value: 80, color: "#ff5252" },
];

// ── Shared panel wrapper ─────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: THEME.panel.background,
        border: `1px solid ${THEME.page.border}`,
        borderRadius: 6,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div
        style={{
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: THEME.page.textSecondary,
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.page.background,
          flexShrink: 0,
        }}
      >
        {title}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>
    </div>
  );
}

// ── Motor card: mini chart + circle gauge (one motor) ───────────────────────

const MOTOR_TICK_FNS: ((t: number) => number)[] = [
  (t) => 0.3 + 0.6 * Math.abs(Math.sin(t / 800)),
  (t) => 0.5 + 0.4 * Math.cos(t / 1100),
  (t) => 0.2 + 0.7 * Math.abs(Math.sin(t / 600 + 1)),
  (t) => 0.6 + 0.3 * Math.sin(t / 950 + 2),
];

function MotorCard({
  name,
  color,
  tickFn,
  timeOrigin,
}: {
  name: string;
  color: string;
  tickFn: (t: number) => number;
  timeOrigin: number;
}) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const { value } = useFluxionGauge({ host });

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        showXLabels: false,
        showYLabels: false,
        gridColor: THEME.chart.gridColor,
        yPadPx: 4,
      }),
      lineLayer("current", { color, lineWidth: 2, retentionMs: 8_000, maxHz: 30 }),
    ],
    [timeOrigin, color],
  );

  useFluxionStream({
    host,
    intervalMs: 1000 / 30,
    setup: (h) => h.line("current"),
    tick: (t, l) => {
      l.push({ t, y: tickFn(t) });
      return 1;
    },
  });

  return (
    <div
      style={{
        flex: 1,
        background: THEME.panel.background,
        border: `1px solid ${THEME.page.border}`,
        borderRadius: 6,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "3px 8px",
          fontSize: 11,
          fontWeight: 600,
          color: THEME.page.textSecondary,
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.page.background,
          flexShrink: 0,
        }}
      >
        {name}
      </div>
      {/* Mini chart */}
      <div style={{ height: 60, position: "relative", flexShrink: 0 }}>
        <FluxionCanvas
          layers={layers}
          hostOptions={{ bgColor: THEME.chart.canvasBg }}
          onReady={setHost}
        />
      </div>
      {/* Gauge */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 0",
        }}
      >
        <FluxionGauge
          value={value * 100}
          min={0}
          max={100}
          thresholds={GAUGE_THRESHOLDS}
          type="circle"
          size={80}
          label="current"
        />
      </div>
    </div>
  );
}

function MotorGaugeRow({ timeOrigin }: { timeOrigin: number }) {
  const motors = ["Motor A", "Motor B", "Motor C", "Motor D"];
  const colors = ["#4fc3f7", "#80ffa0", "#ffb060", "#ce93d8"];

  return (
    <div style={{ display: "flex", gap: 8, height: "100%" }}>
      {motors.map((name, i) => (
        <MotorCard
          key={name}
          name={name}
          color={colors[i]!}
          tickFn={MOTOR_TICK_FNS[i]!}
          timeOrigin={timeOrigin}
        />
      ))}
    </div>
  );
}

// ── Velocity panel (line + event markers) ───────────────────────────────────

function VelocityPanel({
  syncConfig,
  timeOrigin,
}: {
  syncConfig: () => { timeWindowMs: number };
  timeOrigin: number;
}) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const eventsRef = useRef<MarkerEvent[]>([]);
  const [eventCount, setEventCount] = useState(0);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 6,
      }),
      lineLayer("vel", {
        color: "#80ffa0",
        lineWidth: 2,
        retentionMs: 12_000,
        maxHz: TARGET_HZ,
      }),
      eventMarkerLayer("markers"),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", syncConfig()));

  const markerHandle = useMemo(() => host?.eventMarker("markers") ?? null, [host]);

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.line("vel"),
    tick: (t, line) => {
      line.push({ t, y: 0.5 + 0.5 * Math.sin(t / 1200) });
      if (Math.random() < 0.002) {
        const sev: 0 | 1 | 2 = Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2;
        eventsRef.current = [...eventsRef.current, { t, severity: sev }];
        markerHandle?.setEvents(eventsRef.current);
        setEventCount((c) => c + 1);
      }
      return 1;
    },
  });

  return (
    <Panel title={`Velocity · ${eventCount} event${eventCount !== 1 ? "s" : ""}`}>
      <FluxionCanvas
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />
    </Panel>
  );
}

// ── Position scatter (uncertainty encoded as color + size) ──────────────────

function UncertaintyPanel({
  syncConfig,
  timeOrigin,
}: {
  syncConfig: () => { timeWindowMs: number };
  timeOrigin: number;
}) {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 6,
      }),
      scatterColoredLayer("scatter", {
        colormap: "plasma",
        minSize: 3,
        maxSize: 8,
        retentionMs: 12_000,
        maxHz: TARGET_HZ,
      }),
    ],
    [timeOrigin],
  );

  useLayerConfig(host, axisGridLayer("axis", syncConfig()));

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.scatterColored("scatter"),
    tick: (t, scatter) => {
      const pos = Math.sin(t / 900);
      const uncertainty = 0.3 + 0.7 * Math.abs(Math.cos(t / 1400));
      const sample: ScatterColoredSample = {
        t,
        y: pos + (Math.random() - 0.5) * uncertainty * 0.3,
        colorValue: uncertainty,
        size: uncertainty,
      };
      scatter.push(sample);
      return 1;
    },
  });

  return (
    <Panel title="Position (color = uncertainty)">
      <FluxionCanvas
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />
    </Panel>
  );
}

// ── Generic line panel ───────────────────────────────────────────────────────

function LinePanel({
  title,
  layerId,
  color,
  syncConfig,
  timeOrigin,
  genFn,
}: {
  title: string;
  layerId: string;
  color: string;
  syncConfig: () => { timeWindowMs: number };
  timeOrigin: number;
  genFn: (t: number) => number;
}) {
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: DEFAULT_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 6,
      }),
      lineLayer(layerId, { color, lineWidth: 2, retentionMs: 12_000, maxHz: TARGET_HZ }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeOrigin, layerId, color],
  );

  useLayerConfig(host, axisGridLayer("axis", syncConfig()));

  useFluxionStream({
    host,
    intervalMs: 1000 / TARGET_HZ,
    setup: (h) => h.line(layerId),
    tick: (t, line) => {
      const msg = generateFloat32StampedMessage(t);
      const sample: LineSample = {
        t: stampToMs(msg.header),
        y: genFn(t) + (msg.data - 0.5) * 0.1,
      };
      line.push(sample);
      return 1;
    },
  });

  return (
    <Panel title={title}>
      <FluxionCanvas
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />
    </Panel>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { label: "3s", ms: 3000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10_000 },
] as const;

export function RobotDashboardPage() {
  const { windowMs, setWindowMs, timeOrigin, syncConfig } =
    useSyncedTimeWindow(DEFAULT_WINDOW_MS);

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
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: `1px solid ${THEME.page.border}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: THEME.page.textPrimary }}>
          Robot Dashboard
        </span>
        <div
          style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}
        >
          <span style={{ fontSize: 11, color: THEME.page.textSecondary }}>Window:</span>
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.ms}
              onClick={() => setWindowMs(o.ms)}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                background:
                  windowMs === o.ms
                    ? THEME.button.background
                    : THEME.button.inactiveBackground,
                color: windowMs === o.ms ? THEME.button.text : THEME.button.inactiveText,
                border: `1px solid ${windowMs === o.ms ? THEME.button.border : THEME.button.inactiveBorder}`,
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid: 3 rows, each with explicit height */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Row 1: Motor cards (200px) */}
        <div style={{ height: 200, flexShrink: 0 }}>
          <MotorGaugeRow timeOrigin={timeOrigin} />
        </div>

        {/* Row 2 + 3 share remaining space equally */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Row 2: Velocity + Position */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <VelocityPanel syncConfig={syncConfig} timeOrigin={timeOrigin} />
            <UncertaintyPanel syncConfig={syncConfig} timeOrigin={timeOrigin} />
          </div>

          {/* Row 3: IMU */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <LinePanel
              title="IMU Angular Vel"
              layerId="imu"
              color="#ce93d8"
              syncConfig={syncConfig}
              timeOrigin={timeOrigin}
              genFn={(t) => 0.3 * Math.sin(t / 400) + 0.1 * Math.cos(t / 150)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
