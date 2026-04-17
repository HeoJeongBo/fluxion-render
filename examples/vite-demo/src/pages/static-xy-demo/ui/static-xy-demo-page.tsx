import {
  axisGridLayer,
  lineStaticLayer,
  useFluxionCanvas,
} from "@heojeongbo/fluxion-render/react";
import { useEffect, useRef, useState } from "react";
import { generateStaticSineXY } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const X_MIN = -5;
const X_MAX = 5;
const POINT_COUNT = 2048;

export interface StaticXyDemoPageProps {
  compactHud?: boolean;
}

/**
 * Static xy plot: one-shot push of a pre-computed Float32Array. Demonstrates
 * the non-streaming `kind: "line-static"` path. The "Resample" button pushes
 * a new dataset, showing that setData replaces (rather than appends) for the
 * static variant.
 */
export function StaticXyDemoPage({ compactHud = false }: StaticXyDemoPageProps = {}) {
  const { containerRef, host } = useFluxionCanvas({
    hostOptions: { bgColor: THEME.chart.canvasBg },
    layers: [
      axisGridLayer("axis", {
        xRange: [X_MIN, X_MAX],
        yRange: [-1.2, 1.2],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        labelColor: THEME.chart.labelColor,
      }),
      lineStaticLayer("plot", {
        color: "#4fc3f7",
        lineWidth: 1.5,
        layout: "xy",
      }),
    ],
  });

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
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
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
