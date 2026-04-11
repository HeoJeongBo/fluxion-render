import { useState } from "react";
import { THEME } from "../../../shared/ui/theme";
import { WindowSelector } from "../../../shared/ui/window-selector";
import { LidarDemoPage } from "../../lidar-demo";
import { LineDemoPage } from "../../line-demo";
import { StaticXyDemoPage } from "../../static-xy-demo";
import { StreamDemoPage } from "../../stream-demo";

const DEFAULT_WINDOW_MS = 5000;

/**
 * Combined view: all 4 demos rendered in a 2x2 grid, each with its own
 * FluxionHost + worker. A single top-bar `WindowSelector` drives the time
 * window for every streaming chart at once via controlled props. Static and
 * LiDAR demos ignore the window (no time axis) but still render in the grid.
 */
export function AllDemoPage() {
  const [windowMs, setWindowMs] = useState(DEFAULT_WINDOW_MS);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
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
        }}
      >
        <strong style={{ color: THEME.page.textPrimary }}>All demos</strong>
        <span>time window:</span>
        <WindowSelector value={windowMs} onChange={setWindowMs} />
        <span style={{ marginLeft: "auto", color: THEME.page.textMuted }}>
          applies to Stream / Multi-stream (time-based charts)
        </span>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 1,
          background: THEME.page.border,
        }}
      >
        <Cell title="Stream (120Hz)">
          <LineDemoPage windowMs={windowMs} hideSelector compactHud />
        </Cell>
        <Cell title="Multi-stream (3×1200/s)">
          <StreamDemoPage windowMs={windowMs} hideSelector compactHud />
        </Cell>
        <Cell title="Static xy">
          <StaticXyDemoPage compactHud />
        </Cell>
        <Cell title="LiDAR 30k">
          <LidarDemoPage compactHud />
        </Cell>
      </div>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        background: THEME.panel.background,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 10,
          fontSize: 10,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: THEME.page.textMuted,
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
