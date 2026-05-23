import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { ChartReplayApp } from "./chart-replay";
import { DvrApp } from "./dvr";

type Tab = "dvr" | "split" | "chart";

const TAB_LABEL: Record<Tab, string> = {
  dvr: "DVR Demo",
  split: "Split Demo",
  chart: "Chart Replay",
};

function Root() {
  const [tab, setTab] = useState<Tab>("dvr");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f1117" }}>
      <div style={{ display: "flex", borderBottom: "1px solid #2a2d3a", background: "#1a1d27", flexShrink: 0 }}>
        {(["dvr", "split", "chart"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid #4f8ef7" : "2px solid transparent",
              color: tab === t ? "#e2e8f0" : "#555e70",
              transition: "color 0.15s",
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "dvr" ? <DvrApp /> : tab === "split" ? <App /> : <ChartReplayApp />}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
