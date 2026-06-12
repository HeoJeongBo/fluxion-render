import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionCrosshair,
  HoverDataCache,
  lineStaticLayer,
  useFluxionCrosshair,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateStaticSineXY } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const X_MIN = -5;
const X_MAX = 5;
const POINT_COUNT = 2048;
const Y_PAD_PX = 8;
const Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;

export interface StaticXyDemoPageProps {
  compactHud?: boolean;
}

export function StaticXyDemoPage({ compactHud = false }: StaticXyDemoPageProps = {}) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [crosshairEnabled, setCrosshairEnabled] = useState(true);

  const cache = useMemo(() => {
    const c = new HoverDataCache();
    c.registerLayer("plot", { capacity: POINT_COUNT, label: "y(x)", color: "#4fc3f7" });
    return c;
  }, []);

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xRange: [X_MIN, X_MAX],
        yRange: [-1.2, 1.2],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: Y_PAD_PX,
      }),
      lineStaticLayer("plot", {
        color: "#4fc3f7",
        lineWidth: 1.5,
        layout: "xy",
      }),
    ],
    [],
  );

  const seedRef = useRef(1);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!host) return;
    const raw = generateStaticSineXY(POINT_COUNT, X_MIN, X_MAX, seedRef.current);
    cache.clear("plot");
    cache.pushBatch("plot", raw);
    host.lineStatic("plot").pushRaw(raw);
  }, [host, version, cache]);

  const resample = () => {
    seedRef.current = (seedRef.current + 1) >>> 0;
    setVersion((v) => v + 1);
  };

  const { chartRef, state: crosshairState } = useFluxionCrosshair({
    host,
    cache,
    xMode: "fixed",
    xRange: [X_MIN, X_MAX],
    yPadPx: Y_PAD_PX,
    xFormat: (x) => x.toFixed(4),
    yFormat: (y) => y.toFixed(4),
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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

      {/* Mouse capture overlay — only active when crosshair is enabled */}
      <div
        ref={chartRef}
        style={{
          position: "absolute",
          top: 0,
          left: Y_AXIS_WIDTH,
          right: 0,
          bottom: X_AXIS_HEIGHT,
          pointerEvents: crosshairEnabled ? "auto" : "none",
          cursor: crosshairEnabled && crosshairState.position ? "crosshair" : "default",
        }}
      />

      {crosshairEnabled && (
        <FluxionCrosshair
          state={crosshairState}
          style={{
            position: "absolute",
            top: 0,
            left: Y_AXIS_WIDTH,
            right: 0,
            bottom: X_AXIS_HEIGHT,
          }}
        />
      )}

      {/* HUD */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: compactHud ? 11 : 12,
          color: THEME.page.textSecondary,
        }}
      >
        <span>
          {POINT_COUNT} pts · seed {seedRef.current}
        </span>
        <button
          type="button"
          onClick={() => setCrosshairEnabled((v) => !v)}
          style={{
            background: crosshairEnabled
              ? THEME.button.background
              : THEME.button.inactiveBackground,
            color: crosshairEnabled ? THEME.button.text : THEME.button.inactiveText,
            border: `1px solid ${crosshairEnabled ? THEME.button.border : THEME.page.border}`,
            padding: compactHud ? "2px 6px" : "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: compactHud ? 11 : 12,
            fontFamily: "inherit",
          }}
        >
          Crosshair {crosshairEnabled ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={resample}
          style={{
            background: THEME.button.background,
            color: THEME.button.text,
            border: `1px solid ${THEME.button.border}`,
            padding: compactHud ? "2px 6px" : "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: compactHud ? 11 : 12,
            fontFamily: "inherit",
          }}
        >
          Resample
        </button>
      </div>
    </div>
  );
}
