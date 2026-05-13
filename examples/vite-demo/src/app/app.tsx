import { useState } from "react";
import { AllDemoPage } from "../pages/all-demo";
import { AreaDemoPage } from "../pages/area-demo";
import { BarDemoPage } from "../pages/bar-demo";
import { CandlestickDemoPage } from "../pages/candlestick-demo";
import { ExternalAxesDemoPage } from "../pages/external-axes-demo";
import { FluxionWorkerDemoPage } from "../pages/fluxion-worker-demo";
import { HeatmapDemoPage } from "../pages/heatmap-demo";
import { HistoricalDemoPage } from "../pages/historical-demo";
import { LidarDemoPage } from "../pages/lidar-demo";
import { LineDemoPage } from "../pages/line-demo";
import { PoolDemoPage } from "../pages/pool-demo";
import { ScatterDemoPage } from "../pages/scatter-demo";
import { StaticXyDemoPage } from "../pages/static-xy-demo";
import { StepDemoPage } from "../pages/step-demo";
import { StreamDemoPage } from "../pages/stream-demo";
import { TableDemoPage } from "../pages/table-demo";
import { TabBar, type TabBarItem } from "../widgets/tab-bar";

type Tab =
  | "all"
  | "line"
  | "stream"
  | "static"
  | "scatter"
  | "area"
  | "step"
  | "bar"
  | "candlestick"
  | "heatmap"
  | "historical"
  | "lidar"
  | "pool"
  | "fluxion-worker"
  | "external-axes"
  | "table";

const tabs: readonly TabBarItem<Tab>[] = [
  { id: "all", label: "All" },
  { id: "line", label: "Stream" },
  { id: "stream", label: "Multi-stream" },
  { id: "static", label: "Static xy" },
  { id: "scatter", label: "Scatter" },
  { id: "area", label: "Area" },
  { id: "step", label: "Step" },
  { id: "bar", label: "Bar" },
  { id: "candlestick", label: "Candlestick" },
  { id: "heatmap", label: "Heatmap" },
  { id: "historical", label: "Historical" },
  { id: "lidar", label: "LiDAR 30k" },
  { id: "pool", label: "Pool (40 charts)" },
  { id: "fluxion-worker", label: "fluxion-worker" },
  { id: "external-axes", label: "External axes" },
  { id: "table", label: "Table" },
];

export function App() {
  const [tab, setTab] = useState<Tab>("all");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
      }}
    >
      <TabBar items={tabs} active={tab} onSelect={setTab} />
      <main style={{ flex: 1, minHeight: 0 }}>
        {tab === "all" && <AllDemoPage />}
        {tab === "line" && <LineDemoPage />}
        {tab === "stream" && <StreamDemoPage />}
        {tab === "static" && <StaticXyDemoPage />}
        {tab === "scatter" && <ScatterDemoPage />}
        {tab === "area" && <AreaDemoPage />}
        {tab === "step" && <StepDemoPage />}
        {tab === "bar" && <BarDemoPage />}
        {tab === "candlestick" && <CandlestickDemoPage />}
        {tab === "heatmap" && <HeatmapDemoPage />}
        {tab === "historical" && <HistoricalDemoPage />}
        {tab === "lidar" && <LidarDemoPage />}
        {tab === "pool" && <PoolDemoPage />}
        {tab === "fluxion-worker" && <FluxionWorkerDemoPage />}
        {tab === "external-axes" && <ExternalAxesDemoPage />}
        {tab === "table" && <TableDemoPage />}
      </main>
    </div>
  );
}
