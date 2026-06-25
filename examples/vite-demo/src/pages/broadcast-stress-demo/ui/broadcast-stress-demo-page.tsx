/**
 * Broadcast stress — N (default 300) charts at 500 Hz over ONE broadcastStream
 * call per tick, on a MULTI-worker pool.
 *
 * Contrast with the push-based "Stress" demo: there each chart pushes its own
 * stream (coalesced to ~N postMessages/frame, engines spread across workers).
 * Here a single packet carries every chart's samples; the pool groups targets
 * by worker and sends ONE message PER WORKER — so the main thread does only
 * ~(worker count) postMessages/tick while the N engines still run across all
 * workers (size-1 would pile every engine onto one thread).
 *
 * 500 Hz is reached with a stable 50 Hz timer carrying 10 samples/chart/packet
 * (a 2 ms timer is unreliable). The worker (`broadcast-batch-worker.ts`)
 * decodes each channel block into a sample batch and pushes it to its engine.
 *
 * Each chart shows TWO series — a smooth `line` and a distinct `scatter` — so
 * the packet carries two channel blocks per chart (even = line, odd = scatter)
 * and the pump emits two targets per chart. The worker is unchanged: it already
 * routes every target by its `ch` index to `target.layerId`.
 */
import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  scatterLayer,
  useFluxionWorkerPool,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

const SAMPLE_HZ = 500; // samples/channel/sec
const BATCH_HZ = 50; // timer rate
const SAMPLES_PER_BATCH = SAMPLE_HZ / BATCH_HZ; // 10 samples/chart/packet
const DT_US = 1_000_000 / SAMPLE_HZ; // 2000 µs between samples
const TIME_WINDOW_MS = 4000;

const COUNT_OPTIONS = [100, 200, 300] as const;
const MAX_COUNT = 300;

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

type BroadcastPool = ReturnType<typeof useFluxionWorkerPool>;

function BroadcastChart({
  index,
  pool,
  timeOrigin,
  onReady,
}: {
  index: number;
  pool: BroadcastPool;
  timeOrigin: number;
  onReady: (host: FluxionHost) => void;
}) {
  const color = COLORS[index % COLORS.length]!;

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: TIME_WINDOW_MS,
        timeOrigin,
        yMode: "auto",
        showXGrid: false,
        showYGrid: false,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 3,
      }),
      // decimate omitted → AUTO (O(width) at 500 Hz) on both layers below.
      lineLayer("line", {
        color,
        lineWidth: 1,
        retentionMs: TIME_WINDOW_MS,
        maxHz: SAMPLE_HZ,
      }),
      // Second series in the SAME chart: a distinct scattered signal. Shares the
      // axis-grid's auto y-range (both layers' y-extents are merged), and rides
      // its own channel block in the packet (see the pump below).
      scatterLayer("scatter", {
        color: "#ff9f43",
        pointSize: 2,
        shape: "circle",
        opacity: 0.7,
        retentionMs: TIME_WINDOW_MS,
        maxHz: SAMPLE_HZ,
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
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <FluxionCanvas
        externalAxes={false}
        layers={layers}
        hostOptions={{
          bgColor: THEME.chart.canvasBg,
          pool,
          // Multi-worker still puts ~N/W engines per thread — cap render to
          // 30fps and drop the unused bounds/tick traffic.
          maxFps: 30,
          emitBounds: false,
          emitTicks: false,
        }}
        onReady={onReady}
      />
    </div>
  );
}

export function BroadcastStressDemoPage() {
  const pool = useFluxionWorkerPool({
    // Multi-worker, adaptive: start small, grow toward a core-based cap so the
    // N engines spread across threads instead of piling onto one.
    size: 2,
    maxSize: Math.min(
      16,
      Math.max(
        2,
        ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) - 1,
      ),
    ),
    targetPerWorker: 8,
    workerFactory: () =>
      new Worker(new URL("../lib/broadcast-batch-worker.ts", import.meta.url), {
        type: "module",
      }),
  });

  const timeOrigin = useTimeOrigin();
  const [count, setCount] = useState<number>(300);

  const hostsRef = useRef<(FluxionHost | null)[]>(
    Array.from({ length: MAX_COUNT }, () => null),
  );
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    // Per-chart phase/frequency → distinct waveforms.
    const freqs = Array.from({ length: MAX_COUNT }, (_, i) => 0.4 + (i % 11) * 0.25);
    const phases = Array.from({ length: MAX_COUNT }, (_, i) => (i % 17) * 0.37);

    const id = setInterval(() => {
      const n = countRef.current;
      // TWO channels per chart — a "line" target and a "scatter" target, each
      // with its own channel block. Only target hosts the pool still knows
      // about (skip mid-mount/unmount).
      const targets: { hostId: string; layerId: string; ch: number }[] = [];
      const hostIdx: number[] = []; // channel-pair → original chart index
      let ch = 0;
      for (let i = 0; i < n; i++) {
        const host = hostsRef.current[i];
        if (host && pool.hasHost(host.hostId)) {
          targets.push({ hostId: host.hostId, layerId: "line", ch: ch++ });
          targets.push({ hostId: host.hostId, layerId: "scatter", ch: ch++ });
          hostIdx.push(i);
        }
      }
      const channelCount = ch; // = 2 × active charts
      if (channelCount === 0) return;

      // Packet: [t0_us, dt_us, n, <ch0 n samples> <ch1 n samples> ...].
      // Even channels = line (smooth sine), odd channels = scatter (a distinct,
      // scattered-looking signal) for the SAME chart.
      const tEndMs = Date.now() - timeOrigin;
      const tStartMs = tEndMs - SAMPLES_PER_BATCH * (DT_US / 1000);
      const buf = new Float32Array(3 + channelCount * SAMPLES_PER_BATCH);
      buf[0] = tStartMs * 1000;
      buf[1] = DT_US;
      buf[2] = SAMPLES_PER_BATCH;
      for (let c = 0; c < channelCount; c++) {
        const idx = hostIdx[c >> 1]!;
        const isLine = (c & 1) === 0;
        const f = freqs[idx]!;
        const p = phases[idx]!;
        const base = 3 + c * SAMPLES_PER_BATCH;
        for (let j = 0; j < SAMPLES_PER_BATCH; j++) {
          const tt = tStartMs + j * (DT_US / 1000);
          const y = isLine
            ? Math.sin((tt / 1000) * f * Math.PI * 2 + p) * 0.8 +
              Math.sin(tt * 0.013 + idx) * 0.05
            : Math.sin((tt / 1000) * f * 0.6 * Math.PI * 2 + p) * 0.45 +
              Math.sin(tt * 0.07 + idx * 1.3) * 0.2 +
              Math.sin(tt * 0.31 + idx * 2.1) * 0.1;
          buf[base + j] = y * 32767;
        }
      }

      // ONE call → pool fans out one message per worker (both of a chart's
      // targets share the same host, so they ride the same worker's message).
      pool.broadcastStream(targets, buf.buffer, buf.length);
    }, 1000 / BATCH_HZ);

    return () => clearInterval(id);
  }, [pool, timeOrigin]);

  const cols = Math.max(1, Math.round(Math.sqrt((count * 4) / 3)));

  return (
    <div
      style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "8px 16px",
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          fontSize: 12,
          color: THEME.page.textSecondary,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: THEME.page.textPrimary }}>Broadcast · 500 Hz</strong>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Charts:
          {COUNT_OPTIONS.map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => {
                // Reset the host slots BEFORE the grid remounts so the pump
                // never targets a stale host from the previous count.
                hostsRef.current = Array.from({ length: MAX_COUNT }, () => null);
                setCount(n);
              }}
              style={{
                padding: "2px 10px",
                borderRadius: 4,
                cursor: "pointer",
                border: `1px solid ${THEME.page.border}`,
                background: count === n ? THEME.chart.canvasBg : "transparent",
                color: count === n ? THEME.page.textPrimary : THEME.page.textSecondary,
                fontWeight: count === n ? 700 : 400,
              }}
            >
              {n}
            </button>
          ))}
        </label>

        <span>
          {count} charts · line + scatter (2 series · {count * 2} channels) · 500 Hz (50
          Hz × {SAMPLES_PER_BATCH}) · multi-worker ·{" "}
          <strong>1 broadcast/tick → ~1 postMessage per worker</strong> (vs ~{count}×fps
          in the push "Stress" demo)
        </span>
      </div>

      <div
        key={count}
        style={{
          flex: 1,
          minHeight: 0,
          padding: 6,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridAutoRows: "1fr",
          gap: 3,
          background: THEME.page.background,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <BroadcastChart
            key={i}
            index={i}
            pool={pool}
            timeOrigin={timeOrigin}
            onReady={(host) => {
              hostsRef.current[i] = host;
            }}
          />
        ))}
      </div>
    </div>
  );
}
