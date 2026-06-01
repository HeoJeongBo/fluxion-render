import type { FluxionHost, LineSample } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionBrush,
  FluxionCanvas,
  HoverDataCache,
  lineLayer,
  useFluxionBrush,
  useFluxionCrosshair,
  useFluxionExport,
  useFluxionStream,
  useLayerConfig,
  useResizeObserver,
  useTimeOrigin,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useRef, useState } from "react";
import { generateFloat32StampedMessage, stampToMs } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const TARGET_HZ = 60;
const DEFAULT_WINDOW_MS = 5000;
const Y_PAD_PX = 12;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

const cache = new HoverDataCache();
cache.registerLayer("line", { capacity: 4096, label: "signal", color: "#4fc3f7" });

export function BrushDemoPage() {
  const timeOrigin = useTimeOrigin();
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [selection, setSelection] = useState<{ tStart: number; tEnd: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null!);
  const [overlayW, setOverlayW] = useState(0);
  const [overlayH, setOverlayH] = useState(0);
  useResizeObserver(overlayRef, ({ width, height }) => { setOverlayW(width); setOverlayH(height); });

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
        yPadPx: Y_PAD_PX,
      }),
      lineLayer("line", { color: "#4fc3f7", lineWidth: 2, retentionMs: 10_000, maxHz: TARGET_HZ }),
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
      const sample: LineSample = { t: stampToMs(msg.header), y: msg.data };
      cache.push("line", sample.t, sample.y);
      line.push(sample);
      return 1;
    },
  });

  const { brushRef, selection: brushSel, clearSelection } = useFluxionBrush({
    host,
    onSelect: setSelection,
  });

  const { chartRef, state: crosshairState } = useFluxionCrosshair({
    host,
    cache,
    xMode: "time",
    timeWindowMs: DEFAULT_WINDOW_MS,
    timeOrigin,
    yPadPx: Y_PAD_PX,
    xFormat: (t) => new Date(timeOrigin + t).toISOString().slice(11, 23),
    yFormat: (y) => y.toFixed(4),
  });

  const { exportCSV, exportJSON } = useFluxionExport({ cache });

  const fmtDuration = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: THEME.page.background }}>
      <div style={{ padding: "8px 12px", display: "flex", gap: 12, alignItems: "center", borderBottom: `1px solid ${THEME.page.border}` }}>
        <span style={{ fontSize: 12, color: THEME.page.textSecondary }}>
          {selection
            ? `Selection: ${fmtDuration(selection.tEnd - selection.tStart)} · click chart to clear`
            : "Drag on chart to select a time range"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {selection && (
            <button
              onClick={() => { clearSelection(); setSelection(null); }}
              style={{ padding: "4px 10px", fontSize: 12, background: "transparent", color: THEME.page.textSecondary, border: `1px solid ${THEME.page.border}`, borderRadius: 4, cursor: "pointer" }}
            >
              Clear
            </button>
          )}
          <button
            onClick={() => exportCSV()}
            style={{ padding: "4px 12px", fontSize: 12, background: THEME.button.background, color: THEME.button.text, border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Export CSV
          </button>
          <button
            onClick={() => exportJSON()}
            style={{ padding: "4px 12px", fontSize: 12, background: THEME.button.background, color: THEME.button.text, border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Export JSON
          </button>
        </div>
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
        {/* Overlay layer for brush + crosshair interaction */}
        <div
          ref={overlayRef}
          style={{
            position: "absolute",
            top: 0,
            left: Y_AXIS_WIDTH,
            right: 0,
            bottom: X_AXIS_HEIGHT,
            pointerEvents: "auto",
          }}
        >
          <div ref={chartRef} style={{ position: "absolute", inset: 0 }} />
          <FluxionBrush
            brushRef={brushRef}
            selection={brushSel}
            width={overlayW}
            height={overlayH}
            style={{ position: "absolute", top: 0, left: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
