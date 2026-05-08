import { useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import { WorkerHandleTab } from "./worker-handle-tab";
import { WorkerPoolTab } from "./worker-pool-tab";

type Mode = "pool" | "standalone";

export function FluxionWorkerDemoPage() {
  const [mode, setMode] = useState<Mode>("pool");

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: `1px solid ${THEME.page.border}`,
          background: THEME.panel.background,
          fontSize: 12,
          color: THEME.page.textSecondary,
          flexShrink: 0,
        }}
      >
        <strong style={{ color: THEME.page.textPrimary }}>@heojeongbo/fluxion-worker</strong>
        <span style={{ color: THEME.page.textMuted }}>dispatch() · request() · stats() · dispose()</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {(["pool", "standalone"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                border: `1px solid ${m === mode ? THEME.button.border : THEME.page.border}`,
                borderRadius: 4,
                background: m === mode ? THEME.button.background : THEME.button.inactiveBackground,
                color: m === mode ? THEME.button.text : THEME.button.inactiveText,
                cursor: "pointer",
              }}
            >
              {m === "pool" ? "WorkerPool" : "WorkerHandle"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {mode === "pool" ? <WorkerPoolTab /> : <WorkerHandleTab />}
      </div>
    </div>
  );
}
