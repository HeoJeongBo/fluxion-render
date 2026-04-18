import type { FluxionHost } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  lineStaticLayer,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateStaticSineXY } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const X_MIN = -5;
const X_MAX = 5;
const POINT_COUNT = 2048;

export interface StaticXyDemoPageProps {
  compactHud?: boolean;
}

export function StaticXyDemoPage({ compactHud = false }: StaticXyDemoPageProps = {}) {
  const [host, setHost] = useState<FluxionHost | null>(null);

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
        yPadPx: 8,
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
    host
      .lineStatic("plot")
      .pushRaw(generateStaticSineXY(POINT_COUNT, X_MIN, X_MAX, seedRef.current));
  }, [host, version]);

  const resample = () => {
    seedRef.current = (seedRef.current + 1) >>> 0;
    setVersion((v) => v + 1);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionCanvas
        externalAxes
        axisLayerId="axis"
        axisColor={THEME.chart.labelColor}
        layers={layers}
        hostOptions={{ bgColor: THEME.chart.canvasBg }}
        onReady={setHost}
      />
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
