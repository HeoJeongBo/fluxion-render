import type { FluxionHost, XyPoint } from "@heojeongbo/fluxion-render";
import {
  axisGridLayer,
  FluxionCanvas,
  FluxionLegend,
  lineStaticLayer,
  useFluxionHistorical,
} from "@heojeongbo/fluxion-render/react";
import { useMemo, useRef, useState } from "react";
import { rng } from "../../../shared/lib/test-data";
import { THEME } from "../../../shared/ui/theme";

const DATASETS: Record<string, XyPoint[]> = {
  sine: generateSine(512),
  pulse: generatePulse(512),
  noise: generateNoise(512, 0xdeadbeef),
};

function generateSine(n: number): XyPoint[] {
  const out: XyPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 10;
    out[i] = { x, y: Math.sin(x * 2) * 0.8 + Math.cos(x * 0.7) * 0.3 };
  }
  return out;
}

function generatePulse(n: number): XyPoint[] {
  const out: XyPoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 10;
    const t = x - 5;
    out[i] = { x, y: Math.exp(-(t * t) / 0.5) * Math.sin(t * 8) };
  }
  return out;
}

function generateNoise(n: number, seed: number): XyPoint[] {
  const rand = rng(seed);
  const out: XyPoint[] = new Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += (rand() - 0.5) * 0.2;
    out[i] = { x: (i / (n - 1)) * 10, y };
  }
  return out;
}

type DatasetKey = keyof typeof DATASETS;

const DATASET_LABELS: { id: DatasetKey; label: string }[] = [
  { id: "sine", label: "Sine" },
  { id: "pulse", label: "Pulse" },
  { id: "noise", label: "Random walk" },
];

export interface HistoricalDemoPageProps {
  compactHud?: boolean;
}

export function HistoricalDemoPage({ compactHud = false }: HistoricalDemoPageProps = {}) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const [activeKey, setActiveKey] = useState<DatasetKey>("sine");
  const containerRef = useRef<HTMLDivElement>(null);

  const data = DATASETS[activeKey];

  const layers = useMemo(
    () => [
      axisGridLayer("axis", {
        xRange: [0, 10],
        yRange: [-1.2, 1.2],
        gridColor: THEME.chart.gridColor,
        gridDashArray: [3, 3],
        axisColor: THEME.chart.axisColor,
        showXLabels: false,
        showYLabels: false,
        yPadPx: 8,
      }),
      lineStaticLayer("plot", { color: "#80ffa0", lineWidth: 1.5, layout: "xy" }),
    ],
    [],
  );

  useFluxionHistorical({ host, layerId: "plot", data });

  const legendItems = [
    { color: "#80ffa0", label: DATASET_LABELS.find((d) => d.id === activeKey)?.label ?? activeKey },
  ];

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      <FluxionLegend items={legendItems} visibility="hover" containerRef={containerRef} position="top-left" />
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
          gap: 6,
          fontSize: compactHud ? 11 : 12,
        }}
      >
        {DATASET_LABELS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveKey(id)}
            style={{
              background: activeKey === id ? THEME.button.background : "transparent",
              color: activeKey === id ? THEME.button.text : THEME.page.textSecondary,
              border: `1px solid ${activeKey === id ? THEME.button.border : "transparent"}`,
              padding: compactHud ? "2px 6px" : "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: compactHud ? 11 : 12,
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ color: THEME.page.textSecondary }}>
          {data.length} pts
        </span>
      </div>
    </div>
  );
}
