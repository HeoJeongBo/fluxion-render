import type { LineSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  lineLayer,
  useFluxionCanvas,
  useFluxionStream,
} from "@heojeongbo/fluxion-render/react";
import { useMemo } from "react";
import { generateFloat32StampedBatch, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const CHART_COUNT = 40;
const COLS = 8;
const ROWS = Math.ceil(CHART_COUNT / COLS);

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

function MiniChart({ index }: { index: number }) {
  const color = COLORS[index % COLORS.length]!;
  const freqHz = 0.5 + (index % 7) * 0.3;
  const timeOrigin = useMemo(() => Date.now(), []);

  const { containerRef, host } = useFluxionCanvas({
    hostOptions: { bgColor: THEME.chart.canvasBg },
    layers: [
      axisGridLayer("axis", {
        xMode: "time",
        timeWindowMs: 5000,
        timeOrigin,
        yMode: "auto",
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        labelColor: THEME.chart.labelColor,
      }),
      lineLayer("line", { color, lineWidth: 1.5, capacity: 2048 }),
    ],
  });

  useFluxionStream({
    host,
    intervalMs: 1000 / 30,
    setup: (h) => h.line("line"),
    tick: (t, handle) => {
      const msgs = generateFloat32StampedBatch(t, 4, 1000 / (30 * 4), {
        freqHz,
        amplitude: 0.8,
        seriesOffset: index * 0.4,
      });
      const samples: LineSample[] = msgs.map((m) => ({ t: stampToMs(m.header), y: m.data }));
      handle.pushBatch(samples);
      return samples.length;
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
        #{index + 1}
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

/**
 * Renders 40 independent charts that all share the module-level default
 * worker pool (4 workers by default). Open DevTools → Performance → Workers
 * to confirm only 4 workers are active.
 */
export function PoolDemoPage() {
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
        <strong style={{ color: THEME.page.textPrimary }}>Worker Pool Demo</strong>
        <span>
          {CHART_COUNT} charts · 4 workers (default pool) · verify in DevTools → Performance →
          Workers
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
          <MiniChart key={i} index={i} />
        ))}
      </div>
    </div>
  );
}
