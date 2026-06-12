/**
 * Pool Fan-Out Stream Demo — 1 raw packet → worker parse → 64 charts
 *
 * One pool (size=1, 1 worker) serves 64 canvases. Each tick, one raw packet
 * is built and sent via ONE pool.broadcastStream() call.
 * The worker decodes each channel and pushes 1 sample to its matching engine.
 *
 * Wire format: Float32[ 1 + activeCount ]
 *   [0]       timestamp_us  (f32, microseconds)
 *   [1..N]    ch0_raw .. chN_raw  (f32, raw_i16 range [-32767, 32767])
 *
 * targets[ci] always matches buf[1+ci] — ordering is guaranteed because
 * both are built from the same activeTargets array in the same loop.
 */
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionWorkerPool,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { createSineSynth, mulberry32 } from "@heojeongbo/fluxion-render/testing";
import { useEffect, useMemo, useRef } from "react";
import { THEME } from "../../../shared/ui/theme";

const CHART_COUNT = 64;
const COLS = 8;
const ROWS = Math.ceil(CHART_COUNT / COLS);
const SAMPLE_HZ = 120; // samples per channel per second (1 tick = 1 sample)
const INTERVAL_MS = 1000 / SAMPLE_HZ; // ~8.33ms — exactly 120Hz
const TIME_WINDOW_MS = 5000;
const MAX_HZ = SAMPLE_HZ; // 120 samples/channel/sec → capacity = ceil(5*120*1.1) = 660

const COLORS = [
  "#4fc3f7",
  "#80ffa0",
  "#ffb060",
  "#f48fb1",
  "#ce93d8",
  "#80cbc4",
  "#ffcc02",
  "#ef9a9a",
];

const noise = mulberry32(0xdeadbeef);

interface SensorChartProps {
  index: number;
  timeOrigin: number;
  pool: ReturnType<typeof useFluxionWorkerPool>;
  onReady: (host: FluxionHost) => void;
}

function SensorChart({ index, timeOrigin, pool, onReady }: SensorChartProps) {
  const color = COLORS[index % COLORS.length]!;
  const freqHz = 0.4 + index * 0.15;

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
      scatterLayer("line", {
        color,
        pointSize: 3,
        retentionMs: TIME_WINDOW_MS,
        maxHz: MAX_HZ,
      }),
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
        sensor-{index + 1} · {freqHz.toFixed(2)}Hz
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
        hostOptions={{
          bgColor: THEME.chart.canvasBg,
          pool,
        }}
        onReady={onReady}
      />
    </div>
  );
}

export function StreamWorkerDemoPage() {
  const pool = useFluxionWorkerPool({
    size: 1,
    workerFactory: () =>
      new Worker(new URL("../lib/pool-sensor-worker.ts", import.meta.url), {
        type: "module",
      }),
  });

  const timeOrigin = useTimeOrigin();

  const hostsRef = useRef<(FluxionHost | null)[]>(
    Array.from({ length: CHART_COUNT }, () => null),
  );

  useEffect(() => {
    // Each channel: unique frequency + phase → distinct waveform per chart.
    const synths = Array.from({ length: CHART_COUNT }, (_, i) =>
      createSineSynth({ freqHz: 0.4 + i * 0.15, amplitude: 0.8, seriesOffset: i * 0.5 }),
    );
    const t0 = timeOrigin;
    let lastT = 0;

    const id = setInterval(() => {
      const tEnd = Date.now() - t0;
      const tStart = lastT;
      lastT = tEnd;

      // Collect only hosts that belong to the current pool — stale hosts from a
      // previous pool instance (e.g. React StrictMode double-invoke) would cause
      // registry misses in broadcastStream, shifting the ci↔buf index mapping.
      const activeTargets: { hostId: string; layerId: string; idx: number }[] = [];
      for (let i = 0; i < CHART_COUNT; i++) {
        const host = hostsRef.current[i];
        if (host && pool.hasHost(host.hostId)) {
          activeTargets.push({ hostId: host.hostId, layerId: "line", idx: i });
        }
      }
      if (activeTargets.length === 0) return;

      // Raw packet: Float32[1 + activeCount]
      //   [0]     timestamp_us
      //   [1..N]  ch0_raw .. chN_raw  (raw_i16 as f32, range [-32767, 32767])
      // targets[ci] ↔ buf[1+ci] — same loop, same order.
      const t = tStart;
      const buf = new Float32Array(1 + activeTargets.length);
      buf[0] = t * 1000; // ms → µs
      for (let ci = 0; ci < activeTargets.length; ci++) {
        const { idx } = activeTargets[ci]!;
        buf[1 + ci] = (synths[idx]!(t) + idx * 0.2 + (noise() - 0.5) * 0.1) * 32767;
      }

      pool.broadcastStream(
        activeTargets.map(({ hostId, layerId }) => ({ hostId, layerId })),
        buf.buffer,
        buf.length,
      );
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [pool, timeOrigin]);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}
    >
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
        <strong style={{ color: THEME.page.textPrimary }}>Pool Fan-Out Stream</strong>
        <span>
          size-1 pool · {CHART_COUNT} canvases · 1 worker · 1 postMessage/tick · worker
          parses all channels · each chart gets different values
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
          <SensorChart
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
