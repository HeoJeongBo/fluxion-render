import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineLayer,
  useFluxionStream,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { memo, useMemo, useState } from "react";
import { THEME } from "../../../shared/ui/theme";

// Each chart streams 500 samples/sec. We pump in 50 Hz batches (one shared
// 20 ms timer drives ALL charts) and push the 10 samples of each batch as
// INDIVIDUAL `line.push()` calls — deliberately the worst case that the
// per-frame coalescer is designed to absorb. Pushing 300 × 500 = 150k samples
// every second this way produces 150k push() calls but only ~charts × 60fps
// postMessages, because the host batches each layer's staged samples into one
// Op.DATA per animation frame.
const SAMPLES_PER_SEC = 500;
const BATCH_HZ = 50;
const SAMPLES_PER_BATCH = SAMPLES_PER_SEC / BATCH_HZ; // 10
const DT_MS = 1000 / SAMPLES_PER_SEC; // 2 ms

const COUNT_OPTIONS = [50, 120, 300] as const;

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

const StreamChart = memo(function StreamChart({
  index,
  coalesce,
}: {
  index: number;
  coalesce: boolean;
}) {
  const color = COLORS[index % COLORS.length]!;
  const freqHz = 0.4 + (index % 11) * 0.25;
  const phase = (index % 17) * 0.37;
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 4000,
        timeOrigin,
        yMode: "auto",
        showXGrid: false,
        showYGrid: false,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 3,
      }),
      // `decimate` omitted → AUTO: decimates when the ring oversamples the
      // pixel width (which it always does at 500 Hz over a 4 s window).
      lineLayer("line", { color, lineWidth: 1, capacity: 2048 }),
    ],
    [timeOrigin, color],
  );

  useFluxionStream({
    host,
    intervalMs: 1000 / BATCH_HZ,
    // One process-wide 20 ms timer fans out to every chart (no 300 setIntervals).
    shared: true,
    // The rate isn't displayed; skip the per-stream 500ms setState re-render.
    trackRate: false,
    setup: (h) => h.line("line"),
    tick: (t, line) => {
      // Emit the batch's samples across the just-elapsed window, one push() each.
      const t0 = t - SAMPLES_PER_BATCH * DT_MS;
      for (let i = 0; i < SAMPLES_PER_BATCH; i++) {
        const tt = t0 + i * DT_MS;
        const y =
          Math.sin((tt / 1000) * freqHz * Math.PI * 2 + phase) * 0.8 +
          Math.sin(tt * 0.013 + index) * 0.05;
        line.push({ t: tt, y });
      }
      return SAMPLES_PER_BATCH;
    },
  });

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
          coalesce,
          // Cap worker render to 30fps (visually identical for a 4s scroll,
          // ~halves worker CPU), and skip worker→main bounds/tick traffic that
          // nothing here consumes (externalAxes=false, no listeners).
          maxFps: 30,
          emitBounds: false,
          emitTicks: false,
        }}
        onReady={setHost}
      />
    </div>
  );
});

/**
 * Stress test: N independent line charts, each streaming its own 500 Hz signal
 * simultaneously (N × 500 push()/sec). Reproduces the original "80 charts at
 * 500 Hz freezes after 5–10 s" report at up to 300 charts.
 *
 * Each chart is its own FluxionHost sharing the module-level dynamic worker
 * pool (starts at 2 workers, grows toward min(16, cores-1) as charts mount).
 *
 * Toggle "coalesce" off to reproduce the freeze (one postMessage per sample →
 * the worker message queue floods and the event loop starves); on (default)
 * batches each layer's samples into one message per animation frame, so it
 * keeps running.
 */
export function StressTestDemoPage() {
  const [count, setCount] = useState<number>(300);
  const [coalesce, setCoalesce] = useState(true);

  // Roughly 4:3 cells: cols ≈ sqrt(count * 4/3).
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
        <strong style={{ color: THEME.page.textPrimary }}>Stress: charts × 500 Hz</strong>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Charts:
          {COUNT_OPTIONS.map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setCount(n)}
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

        <label
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={coalesce}
            onChange={(e) => setCoalesce(e.target.checked)}
          />
          coalesce {coalesce ? "(on — batched/frame)" : "(off — 1 msg/sample)"}
        </label>

        <span>
          target {count} × {SAMPLES_PER_SEC} Hz ={" "}
          {((count * SAMPLES_PER_SEC) / 1000).toFixed(0)}k samples/s ·{" "}
          {coalesce
            ? "≈ charts × 60fps postMessages/s"
            : "≈ charts × 500 postMessages/s — expect a freeze in ~5–10 s"}
        </span>
      </div>

      <div
        // Remount the whole grid when count or coalesce changes.
        key={`${count}-${coalesce}`}
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
          <StreamChart key={i} index={i} coalesce={coalesce} />
        ))}
      </div>
    </div>
  );
}
