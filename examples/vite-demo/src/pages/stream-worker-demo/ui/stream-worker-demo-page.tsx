/**
 * Stream Worker Demo
 *
 * Shows the custom worker script pattern:
 *   main thread  →  emitStream(rawBuffer)  [ArrayBuffer transfer, zero-copy]
 *   worker       →  decode + engine.pushRaw()  [no main-thread parsing]
 *   OffscreenCanvas  →  rendered on worker thread
 *
 * Compare with pool-demo: there, main thread parses LineSample[] and calls
 * pushBatch(). Here, the raw [stamp_ms, value] pairs are assembled in main
 * but the buffer is transferred immediately — the worker owns and decodes it.
 *
 * Wire format per sample: Float32[2] = [ stamp_ms, value ]
 */
import {
  axisGridLayer,
  FluxionCanvas,
  scatterLayer,
} from "@heojeongbo/fluxion-render/react";
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSineSynth, mulberry32 } from "@heojeongbo/fluxion-render/testing";
import { THEME } from "../../../shared/ui/theme";

const CHART_COUNT = 40;
const COLS = 8;
const ROWS = Math.ceil(CHART_COUNT / COLS);
const BATCH_SIZE = 2;            // samples packed per transfer
const INTERVAL_MS = BATCH_SIZE * (1000 / 120);  // fire every ~16.7ms, send 2 samples
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
}

function SensorChart({ index }: SensorChartProps) {
  const color = COLORS[index % COLORS.length]!;
  const freqHz = 0.4 + index * 0.15;
  const timeOrigin = useMemo(() => Date.now(), []);
  const [host, setHost] = useState<FluxionHost | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t0Ref = useRef<number | null>(null);

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

  useEffect(() => {
    if (!host) return;
    const synth = createSineSynth({ freqHz, amplitude: 0.8, seriesOffset: index * 0.5 });
    const dtMs = 1000 / 120;

    timerRef.current = setInterval(() => {
      if (t0Ref.current === null) t0Ref.current = Date.now();
      const tEnd = Date.now() - t0Ref.current;
      const tStart = tEnd - INTERVAL_MS;

      // Wire format: [timestamp_us: f32, raw_i16_value: f32] per sample
      // timestamp in microseconds, value in [-32767, 32767] raw range
      // Worker decodes: us→ms, raw→[-1,1]
      const buf = new Float32Array(BATCH_SIZE * 2);
      for (let i = 0; i < BATCH_SIZE; i++) {
        const t = tStart + i * dtMs;
        const raw = (synth(t) + (noise() - 0.5) * 0.1) * 32767;
        buf[i * 2]     = t * 1000;   // ms → µs
        buf[i * 2 + 1] = raw;        // normalized → raw i16 range
      }

      // Transfer ownership — zero-copy, buf.buffer detached after this call
      host.emitStream("line", buf.buffer, buf.length);
    }, INTERVAL_MS);

    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      timerRef.current = null;
      t0Ref.current = null;
    };
  }, [host, freqHz, index]);

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
          workerFactory: () =>
            new Worker(
              new URL("../lib/sensor-worker.ts", import.meta.url),
              { type: "module" },
            ),
        }}
        onReady={setHost}
      />
    </div>
  );
}

export function StreamWorkerDemoPage() {
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
        <strong style={{ color: THEME.page.textPrimary }}>Custom Worker — Zero-Copy Stream</strong>
        <span>
          Each chart owns a dedicated worker · main thread assembles raw Float32 buffer · worker
          decodes + draws · no parsing on main thread
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
          <SensorChart key={i} index={i} />
        ))}
      </div>
    </div>
  );
}
