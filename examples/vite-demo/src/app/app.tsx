import { useState } from "react";
import { AllDemoPage } from "../pages/all-demo";
import { AreaDemoPage } from "../pages/area-demo";
import { BrushDemoPage } from "../pages/brush-demo";
import { CrosshairDemoPage } from "../pages/crosshair-demo";
import { BarDemoPage } from "../pages/bar-demo";
import { CandlestickDemoPage } from "../pages/candlestick-demo";
import { EventMarkerDemoPage } from "../pages/event-marker-demo";
import { ExternalAxesDemoPage } from "../pages/external-axes-demo";
import { FluxionWorkerDemoPage } from "../pages/fluxion-worker-demo";
import { GaugeDemoPage } from "../pages/gauge-demo";
import { HeatmapDemoPage } from "../pages/heatmap-demo";
import { HighRateDemoPage } from "../pages/high-rate-demo";
import { PieDemoPage } from "../pages/pie-demo";
import { PoseArrowDemoPage } from "../pages/pose-arrow-demo";
import { ReferenceLineDemoPage } from "../pages/reference-line-demo";
import { HistoricalDemoPage } from "../pages/historical-demo";
import { LidarDemoPage } from "../pages/lidar-demo";
import { LineDemoPage } from "../pages/line-demo";
import { PoolDemoPage } from "../pages/pool-demo";
import { RobotDashboardPage } from "../pages/robot-dashboard";
import { StreamWorkerDemoPage } from "../pages/stream-worker-demo";
import { ScatterColoredDemoPage } from "../pages/scatter-colored-demo";
import { ScatterDemoPage } from "../pages/scatter-demo";
import { StaticXyDemoPage } from "../pages/static-xy-demo";
import { StepDemoPage } from "../pages/step-demo";
import { StreamDemoPage } from "../pages/stream-demo";
import { TableDemoPage } from "../pages/table-demo";
import { SideBar, type SideBarGroup } from "../widgets/tab-bar";

type Tab =
  | "all"
  | "line"
  | "stream"
  | "crosshair"
  | "static"
  | "scatter"
  | "area"
  | "step"
  | "bar"
  | "candlestick"
  | "heatmap"
  | "high-rate"
  | "historical"
  | "lidar"
  | "pool"
  | "fluxion-worker"
  | "external-axes"
  | "table"
  | "event-marker"
  | "scatter-colored"
  | "gauge"
  | "brush"
  | "robot-dashboard"
  | "reference-line"
  | "pose-arrow"
  | "pie"
  | "stream-worker";

const groups: readonly SideBarGroup<Tab>[] = [
  {
    label: "Robot",
    items: [{ id: "robot-dashboard", label: "Dashboard" }],
  },
  {
    label: "Basic Charts",
    items: [
      { id: "all", label: "All" },
      { id: "line", label: "Stream" },
      { id: "high-rate", label: "500 Hz Stream" },
      { id: "stream", label: "Multi-stream" },
      { id: "crosshair", label: "Crosshair" },
      { id: "static", label: "Static XY" },
      { id: "scatter", label: "Scatter" },
      { id: "area", label: "Area" },
      { id: "step", label: "Step" },
      { id: "bar", label: "Bar" },
      { id: "candlestick", label: "Candlestick" },
      { id: "heatmap", label: "Heatmap" },
      { id: "pie", label: "Pie Chart" },
      { id: "table", label: "Table" },
    ],
  },
  {
    label: "Robot Specific",
    items: [
      { id: "event-marker", label: "Event Markers" },
      { id: "scatter-colored", label: "Scatter Colored" },
      { id: "gauge", label: "Gauge" },
      { id: "reference-line", label: "Reference Line" },
      { id: "pose-arrow", label: "Pose Arrow" },
      { id: "brush", label: "Brush + Export" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { id: "historical", label: "Historical" },
      { id: "lidar", label: "LiDAR 30k" },
      { id: "pool", label: "Pool (40 charts)" },
      { id: "stream-worker", label: "Custom Worker Stream" },
      { id: "fluxion-worker", label: "fluxion-worker" },
      { id: "external-axes", label: "External axes" },
    ],
  },
];

export function App() {
  const [tab, setTab] = useState<Tab>("robot-dashboard");

  return (
    <div style={{ display: "flex", flexDirection: "row", height: "100%", width: "100%" }}>
      <SideBar groups={groups} active={tab} onSelect={setTab} />
      <main style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tab === "all" && <AllDemoPage />}
        {tab === "line" && <LineDemoPage />}
        {tab === "stream" && <StreamDemoPage />}
        {tab === "crosshair" && <CrosshairDemoPage />}
        {tab === "static" && <StaticXyDemoPage />}
        {tab === "scatter" && <ScatterDemoPage />}
        {tab === "area" && <AreaDemoPage />}
        {tab === "step" && <StepDemoPage />}
        {tab === "bar" && <BarDemoPage />}
        {tab === "candlestick" && <CandlestickDemoPage />}
        {tab === "heatmap" && <HeatmapDemoPage />}
        {tab === "high-rate" && <HighRateDemoPage />}
        {tab === "historical" && <HistoricalDemoPage />}
        {tab === "lidar" && <LidarDemoPage />}
        {tab === "pool" && <PoolDemoPage />}
        {tab === "fluxion-worker" && <FluxionWorkerDemoPage />}
        {tab === "external-axes" && <ExternalAxesDemoPage />}
        {tab === "table" && <TableDemoPage />}
        {tab === "event-marker" && <EventMarkerDemoPage />}
        {tab === "scatter-colored" && <ScatterColoredDemoPage />}
        {tab === "gauge" && <GaugeDemoPage />}
        {tab === "brush" && <BrushDemoPage />}
        {tab === "robot-dashboard" && <RobotDashboardPage />}
        {tab === "reference-line" && <ReferenceLineDemoPage />}
        {tab === "pose-arrow" && <PoseArrowDemoPage />}
        {tab === "pie" && <PieDemoPage />}
        {tab === "stream-worker" && <StreamWorkerDemoPage />}
      </main>
    </div>
  );
}
