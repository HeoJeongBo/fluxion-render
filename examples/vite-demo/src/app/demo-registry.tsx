import type { ComponentType } from "react";
import { AllDemoPage } from "../pages/all-demo";
import { AreaDemoPage } from "../pages/area-demo";
import { BarDemoPage } from "../pages/bar-demo";
import { BrushDemoPage } from "../pages/brush-demo";
import { CandlestickDemoPage } from "../pages/candlestick-demo";
import { CrosshairDemoPage } from "../pages/crosshair-demo";
import { EventMarkerDemoPage } from "../pages/event-marker-demo";
import { ExternalAxesDemoPage } from "../pages/external-axes-demo";
import { FluxionWorkerDemoPage } from "../pages/fluxion-worker-demo";
import { FollowClockDemoPage } from "../pages/follow-clock-demo";
import { GaugeDemoPage } from "../pages/gauge-demo";
import { HeatmapDemoPage } from "../pages/heatmap-demo";
import { HighRateDemoPage } from "../pages/high-rate-demo";
import { HistoricalDemoPage } from "../pages/historical-demo";
import { LidarDemoPage } from "../pages/lidar-demo";
import { LineDemoPage } from "../pages/line-demo";
import { PieDemoPage } from "../pages/pie-demo";
import { PoolDemoPage } from "../pages/pool-demo";
import { PoseArrowDemoPage } from "../pages/pose-arrow-demo";
import { ReferenceLineDemoPage } from "../pages/reference-line-demo";
import { RobotDashboardPage } from "../pages/robot-dashboard";
import { ScatterColoredDemoPage } from "../pages/scatter-colored-demo";
import { ScatterDemoPage } from "../pages/scatter-demo";
import { StaticXyDemoPage } from "../pages/static-xy-demo";
import { StepDemoPage } from "../pages/step-demo";
import { StreamDemoPage } from "../pages/stream-demo";
import { StreamWorkerDemoPage } from "../pages/stream-worker-demo";
import { TableDemoPage } from "../pages/table-demo";

/** One demo: its URL slug, sidebar label, and page component. */
export interface DemoEntry {
  /** URL path segment (route is `/${slug}`). */
  slug: string;
  /** Sidebar label. */
  label: string;
  component: ComponentType;
}

export interface DemoGroup {
  label: string;
  demos: DemoEntry[];
}

/**
 * Single source of truth for the demo app: both the TanStack Router routes and
 * the sidebar navigation are generated from this. Add a demo here and it gets a
 * route at `/${slug}` plus a sidebar link automatically.
 */
export const DEMO_GROUPS: readonly DemoGroup[] = [
  {
    label: "Robot",
    demos: [
      { slug: "robot-dashboard", label: "Dashboard", component: RobotDashboardPage },
    ],
  },
  {
    label: "Basic Charts",
    demos: [
      { slug: "all", label: "All", component: AllDemoPage },
      { slug: "line", label: "Stream", component: LineDemoPage },
      { slug: "high-rate", label: "500 Hz Stream", component: HighRateDemoPage },
      { slug: "stream", label: "Multi-stream", component: StreamDemoPage },
      {
        slug: "follow-clock",
        label: "Follow Clock (bursty)",
        component: FollowClockDemoPage,
      },
      { slug: "crosshair", label: "Crosshair", component: CrosshairDemoPage },
      { slug: "static", label: "Static XY", component: StaticXyDemoPage },
      { slug: "scatter", label: "Scatter", component: ScatterDemoPage },
      { slug: "area", label: "Area", component: AreaDemoPage },
      { slug: "step", label: "Step", component: StepDemoPage },
      { slug: "bar", label: "Bar", component: BarDemoPage },
      { slug: "candlestick", label: "Candlestick", component: CandlestickDemoPage },
      { slug: "heatmap", label: "Heatmap", component: HeatmapDemoPage },
      { slug: "pie", label: "Pie Chart", component: PieDemoPage },
      { slug: "table", label: "Table", component: TableDemoPage },
    ],
  },
  {
    label: "Robot Specific",
    demos: [
      { slug: "event-marker", label: "Event Markers", component: EventMarkerDemoPage },
      {
        slug: "scatter-colored",
        label: "Scatter Colored",
        component: ScatterColoredDemoPage,
      },
      { slug: "gauge", label: "Gauge", component: GaugeDemoPage },
      {
        slug: "reference-line",
        label: "Reference Line",
        component: ReferenceLineDemoPage,
      },
      { slug: "pose-arrow", label: "Pose Arrow", component: PoseArrowDemoPage },
      { slug: "brush", label: "Brush + Export", component: BrushDemoPage },
    ],
  },
  {
    label: "Infrastructure",
    demos: [
      { slug: "historical", label: "Historical", component: HistoricalDemoPage },
      { slug: "lidar", label: "LiDAR 30k", component: LidarDemoPage },
      { slug: "pool", label: "Pool (40 charts)", component: PoolDemoPage },
      {
        slug: "stream-worker",
        label: "Custom Worker Stream",
        component: StreamWorkerDemoPage,
      },
      {
        slug: "fluxion-worker",
        label: "fluxion-worker",
        component: FluxionWorkerDemoPage,
      },
      { slug: "external-axes", label: "External axes", component: ExternalAxesDemoPage },
    ],
  },
];

/** Flat list of every demo (route generation). */
export const ALL_DEMOS: readonly DemoEntry[] = DEMO_GROUPS.flatMap((g) => g.demos);

/** Default landing demo slug. */
export const DEFAULT_DEMO_SLUG = "robot-dashboard";
