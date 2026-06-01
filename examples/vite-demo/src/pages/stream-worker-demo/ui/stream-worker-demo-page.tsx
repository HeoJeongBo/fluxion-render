/**
 * Pool Fan-Out Stream Demo
 *
 * One pool (size=1, 1 worker) serves 40 canvases. Each tick, one packet per
 * channel is assembled on the main thread as raw Float32 wire format and sent
 * via pool.broadcastStream() — the worker decodes and pushes to each engine.
 *
 * Compared to the previous solo-worker pattern (40 workers):
 *   - Workers:   40  → 1
 *   - Decode:    40× → 40× (per tick, but all in one thread — no scheduling overhead)
 *   - postMessage paths: 40 workers → 1 worker
 *
 * Wire format per sample: Float32[2] = [ timestamp_us, raw_i16 ]
 * Decoded in pool-sensor-worker: us/1000 → ms, raw/32767 → [-1, 1]
 */
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { createSineSynth, mulberry32 } from "@heojeongbo/fluxion-render/testing";
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
  useFluxionWorkerPool,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef } from "react";
import { THEME } from "../../../shared/ui/theme";

const CHART_COUNT = 40;
const COLS = 8;
const ROWS = Math.ceil(CHART_COUNT / COLS);
const BATCH_SIZE = 2;
const INTERVAL_MS = BATCH_SIZE * (1000 / 120); // ~16.7ms
const TIME_WINDOW_MS = 5000;
const CAPACITY = 2048;

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
  pool: ReturnType<typeof useFluxionWorkerPool>;
  onReady: (host: FluxionHost) => void;
}

function SensorChart({ index, pool, onReady }: SensorChartProps) {
  const color = COLORS[index % COLORS.length]!;
  const freqHz = 0.4 + index * 0.15;
  const timeOrigin = useMemo(() => Date.now(), []);

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
        yPadPx: 8,
      }),
      scatterLayer("line", { color, pointSize: 3, capacity: CAPACITY }),
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
      new Worker(
        new URL("../lib/pool-sensor-worker.ts", import.meta.url),
        { type: "module" },
      ),
  });

  const hostsRef = useRef<(FluxionHost | null)[]>(
    Array.from({ length: CHART_COUNT }, () => null),
  );

  const readyCountRef = useRef(0);

  useEffect(() => {
    const synths = Array.from({ length: CHART_COUNT }, (_, i) =>
      createSineSynth({ freqHz: 0.4 + i * 0.15, amplitude: 0.8, seriesOffset: i * 0.5 }),
    );
    const dtMs = 1000 / 120;
    const t0 = Date.now();
    let lastT = 0;

    const id = setInterval(() => {
      const tEnd = Date.now() - t0;
      const tStart = lastT;
      lastT = tEnd;

      for (let i = 0; i < CHART_COUNT; i++) {
        const host = hostsRef.current[i];
        if (!host) continue;

        const buf = new Float32Array(BATCH_SIZE * 2);
        for (let s = 0; s < BATCH_SIZE; s++) {
          const t = tStart + s * dtMs;
          const raw = (synths[i]!(t) + (noise() - 0.5) * 0.1) * 32767;
          buf[s * 2]     = t * 1000; // ms → µs (decoded back in worker)
          buf[s * 2 + 1] = raw;       // normalized → raw i16 range
        }

        pool.broadcastStream(
          [{ hostId: host.hostId, layerId: "line" }],
          buf.buffer,
          buf.length,
        );
      }
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [pool]);

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
        <strong style={{ color: THEME.page.textPrimary }}>Pool Fan-Out Stream</strong>
        <span>
          size-1 pool · {CHART_COUNT} canvases · 1 worker · decode in worker ·
          {" "}raw wire format (µs + i16) transferred per channel
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
            pool={pool}
            onReady={(host) => {
              hostsRef.current[i] = host;
              readyCountRef.current++;
            }}
          />
        ))}
      </div>
    </div>
  );
}
