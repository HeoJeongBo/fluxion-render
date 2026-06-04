import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { ChartReplayApp } from "./chart-replay";
import { DvrApp } from "./dvr";
import "./index.css";
import { WorkerFanOutApp } from "./worker-fan-out";

type Tab = "dvr" | "split" | "chart" | "worker-fan-out";

const TAB_LABEL: Record<Tab, string> = {
  dvr: "DVR Demo",
  split: "Split Demo",
  chart: "Chart Replay",
  "worker-fan-out": "Worker Fan-Out",
};

function Root() {
  const [tab, setTab] = useState<Tab>("dvr");
  return (
    <div className="flex flex-col h-screen bg-app-bg">
      <div className="flex border-b border-app-border bg-app-panel shrink-0">
        {(["dvr", "split", "chart", "worker-fan-out"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-semibold cursor-pointer bg-transparent border-none border-b-2 transition-colors ${
              tab === t
                ? "border-app-accent text-app-text"
                : "border-transparent text-app-muted"
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "dvr" && <DvrApp />}
        {tab === "split" && <App />}
        {tab === "chart" && <ChartReplayApp />}
        {tab === "worker-fan-out" && <WorkerFanOutApp />}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
