/**
 * Friday 0x0001 Demo — mock packet → worker parse → 64 Joint Position charts
 *
 * One pool (size=1, 1 worker) serves 64 canvases. Each tick, a mock Friday
 * packet is built and sent via ONE pool.broadcastStream() call.
 * The worker reads Joint Position (actual) at offset 164 and pushes 1 sample
 * to each engine.
 *
 * Wire format: 4 + 1248 = 1252 bytes
 *   [0..3]      Float32 LE: t_ms (elapsed ms)
 *   [4..1251]   Friday 0x0001 packet (1248 B raw)
 *     offset 160 in packet (= buf offset 164): Joint Position actual i16×64
 *
 * targets[ci] ↔ Joint Position[ci] — ordering guaranteed by the same loop.
 */
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { createSineSynth } from "@heojeongbo/fluxion-render/testing";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionWorkerPool,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef } from "react";
import { THEME } from "../../../shared/ui/theme";

const CHART_COUNT = 64;
const COLS = 8;
const ROWS = Math.ceil(CHART_COUNT / COLS);
const SAMPLE_HZ = 100;
const INTERVAL_MS = 1000 / SAMPLE_HZ;
const TIME_WINDOW_MS = 5000;
const MAX_HZ = SAMPLE_HZ;

const PACKET_SIZE = 1248;
const BUF_SIZE = 4 + PACKET_SIZE; // t_ms prefix + Friday packet
const JOINT_POS_BUF_OFFSET = 4 + 160; // prefix(4) + Friday offset(160)

const JOINT_NAMES: string[] = [
  "Mobile A", "Mobile B",
  "Waist A", "Waist B", "Waist C", "Waist D", "Waist E",
  "Arm L A", "Arm L B", "Arm L C", "Arm L D", "Arm L E", "Arm L F", "Arm L G",
  "HL A0", "HL A1", "HL A2", "HL A3",
  "HL B0", "HL B1", "HL B2", "HL B3",
  "HL C0", "HL C1", "HL C2", "HL C3",
  "HL D0", "HL D1", "HL D2", "HL D3",
  "HL E0", "HL E1", "HL E2", "HL E3",
  "Arm R A", "Arm R B", "Arm R C", "Arm R D", "Arm R E", "Arm R F", "Arm R G",
  "HR A0", "HR A1", "HR A2", "HR A3",
  "HR B0", "HR B1", "HR B2", "HR B3",
  "HR C0", "HR C1", "HR C2", "HR C3",
  "HR D0", "HR D1", "HR D2", "HR D3",
  "HR E0", "HR E1", "HR E2", "HR E3",
  "Head A", "Head B",
];

const COLORS = [
  "#4fc3f7", "#80ffa0", "#ffb060", "#f48fb1",
  "#ce93d8", "#80cbc4", "#ffcc02", "#ef9a9a",
];

interface JointChartProps {
  index: number;
  timeOrigin: number;
  pool: ReturnType<typeof useFluxionWorkerPool>;
  onReady: (host: FluxionHost) => void;
}

function JointChart({ index, timeOrigin, pool, onReady }: JointChartProps) {
  const color = COLORS[index % COLORS.length]!;
  const name = JOINT_NAMES[index] ?? `joint-${index}`;

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: TIME_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        showXGrid: true,
        showYGrid: true,
        showXLabels: false,
        showYLabels: false,
        gridColor: THEME.chart.gridColor,
        axisColor: THEME.chart.axisColor,
        yPadPx: 4,
      }),
      scatterLayer("line", { color, pointSize: 2, retentionMs: TIME_WINDOW_MS, maxHz: MAX_HZ }),
    ],
    [timeOrigin, color],
  );

  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        background: THEME.panel.background,
        border: `1px solid ${THEME.page.border}`,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 6,
          fontSize: 9,
          color: THEME.page.textMuted,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {index} · {name}
      </div>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        yAxisWidth={32}
        xAxisHeight={0}
        axisColor={THEME.chart.labelColor}
        axisFont="8px sans-serif"
        axisTickSize={3}
        axisTickMargin={2}
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg, pool }}
        onReady={onReady}
      />
    </div>
  );
}

export function StreamWorkerDemoPage() {
  const pool = useFluxionWorkerPool({
    size: 1,
    workerFactory: () =>
      new Worker(
        new URL("../lib/pool-friday-worker.ts", import.meta.url),
        { type: "module" },
      ),
  });

  const timeOrigin = useTimeOrigin();

  const hostsRef = useRef<(FluxionHost | null)[]>(
    Array.from({ length: CHART_COUNT }, () => null),
  );

  useEffect(() => {
    const synths = Array.from({ length: CHART_COUNT }, (_, i) =>
      createSineSynth({ freqHz: 0.3 + i * 0.1, amplitude: 0.8, seriesOffset: i * 0.4 }),
    );
    const t0 = timeOrigin;
    let lastT = 0;

    const id = setInterval(() => {
      const tEnd = Date.now() - t0;
      const tMs = lastT;
      lastT = tEnd;

      const activeTargets: { hostId: string; layerId: string; idx: number }[] = [];
      for (let i = 0; i < CHART_COUNT; i++) {
        const host = hostsRef.current[i];
        if (host && pool.hasHost(host.hostId)) {
          activeTargets.push({ hostId: host.hostId, layerId: "line", idx: i });
        }
      }
      if (activeTargets.length === 0) return;

      // Build mock Friday 0x0001 packet with t_ms prefix
      const buf = new ArrayBuffer(BUF_SIZE);
      const view = new DataView(buf);

      // [0..3] Float32 LE: elapsed ms
      view.setFloat32(0, tMs, true);

      // Joint Position actual: buf offset 164 (= prefix 4 + Friday offset 160)
      // targets[ci] ↔ Joint Position[ci] — same loop, same order
      for (let ci = 0; ci < activeTargets.length; ci++) {
        const { idx } = activeTargets[ci]!;
        const val = synths[idx]!(tMs) + idx * 0.03;
        view.setInt16(JOINT_POS_BUF_OFFSET + ci * 2, Math.round(val * 32767), true);
      }

      pool.broadcastStream(
        activeTargets.map(({ hostId, layerId }) => ({ hostId, layerId })),
        buf,
        BUF_SIZE / 4,
      );
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [pool, timeOrigin]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          fontSize: 12,
          color: THEME.page.textSecondary,
          flexShrink: 0,
        }}
      >
        <strong style={{ color: THEME.page.textPrimary }}>Friday 0x0001</strong>
        <span>
          size-1 pool · {CHART_COUNT} joints · 1 worker · 1 postMessage/tick ·
          {" "}worker parses Joint Position from 1252-byte packet
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: 8,
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          gap: 4,
          background: THEME.page.background,
        }}
      >
        {Array.from({ length: CHART_COUNT }, (_, i) => (
          <JointChart
            key={i}
            index={i}
            timeOrigin={timeOrigin}
            pool={pool}
            onReady={(host) => {
              hostsRef.current[i] = host;
            }}
          />
        ))}
      </div>
    </div>
  );
}
