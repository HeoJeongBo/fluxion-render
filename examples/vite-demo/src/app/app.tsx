import { useState } from "react";
import { AllDemoPage } from "../pages/all-demo";
import { LidarDemoPage } from "../pages/lidar-demo";
import { LineDemoPage } from "../pages/line-demo";
import { PoolDemoPage } from "../pages/pool-demo";
import { StaticXyDemoPage } from "../pages/static-xy-demo";
import { StreamDemoPage } from "../pages/stream-demo";
import { TabBar, type TabBarItem } from "../widgets/tab-bar";

type Tab = "all" | "line" | "stream" | "static" | "lidar" | "pool";

const tabs: readonly TabBarItem<Tab>[] = [
  { id: "all", label: "All" },
  { id: "line", label: "Stream" },
  { id: "stream", label: "Multi-stream" },
  { id: "static", label: "Static xy" },
  { id: "lidar", label: "LiDAR 30k" },
  { id: "pool", label: "Pool (40 charts)" },
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
        {tab === "lidar" && <LidarDemoPage />}
        {tab === "pool" && <PoolDemoPage />}
      </main>
    </div>
  );
}
