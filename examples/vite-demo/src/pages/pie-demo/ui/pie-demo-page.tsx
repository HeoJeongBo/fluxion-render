import { FluxionPieChart } from "@heojeongbo/fluxion-render/react";
import { THEME } from "../../../shared/ui/theme";

const SYSTEM_DATA = [
  { name: "CPU", value: 38, fill: "#4fc3f7" },
  { name: "RAM", value: 29, fill: "#80ffa0" },
  { name: "GPU", value: 18, fill: "#ffb060" },
  { name: "Disk I/O", value: 10, fill: "#ce93d8" },
  { name: "Network", value: 5, fill: "#ff7043" },
];

const TASK_DATA = [
  { name: "Navigation", value: 42 },
  { name: "Perception", value: 28 },
  { name: "Planning", value: 16 },
  { name: "Control", value: 9 },
  { name: "Idle", value: 5 },
];

const STATUS_DATA = [
  { name: "Active", value: 71, fill: "#4caf50" },
  { name: "Warning", value: 19, fill: "#ffb060" },
  { name: "Error", value: 10, fill: "#ff5252" },
];

const total = TASK_DATA.reduce((s, d) => s + d.value, 0);

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: THEME.panel.background,
        border: `1px solid ${THEME.page.border}`,
        borderRadius: 8,
        padding: "20px 24px",
        gap: 12,
        flex: 1,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.page.textPrimary }}>{title}</div>
        <div style={{ fontSize: 11, color: THEME.page.textMuted, marginTop: 3 }}>{description}</div>
      </div>
      {children}
    </div>
  );
}

export function PieDemoPage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: THEME.page.background,
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 20px 8px",
          borderBottom: `1px solid ${THEME.page.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: THEME.page.textPrimary }}>
          Pie Chart
        </div>
        <div style={{ fontSize: 11, color: THEME.page.textMuted, marginTop: 2 }}>
          Pie · Donut · Semi-circle — hover for tooltip, label and legend support
        </div>
      </div>

      {/* Row 1: Pie + Donut */}
      <div style={{ display: "flex", gap: 16, padding: "16px 20px 0", flexShrink: 0 }}>
        <Section
          title="Pie Chart"
          description="label=name · labelLine · tooltip · legend"
        >
          <FluxionPieChart
            data={SYSTEM_DATA}
            outerRadius={80}
            size={200}
            label="name"
            labelLine
            tooltip
            legend
            legendPosition="bottom"
          />
        </Section>

        <Section
          title="Donut Chart"
          description="innerRadius · paddingAngle · centerValue · legend"
        >
          <FluxionPieChart
            data={TASK_DATA}
            innerRadius={52}
            outerRadius={82}
            paddingAngle={3}
            size={200}
            centerValue={`${total}`}
            centerLabel="Total"
            label="percent"
            labelLine
            tooltip
            legend
            legendPosition="bottom"
          />
        </Section>

        <Section
          title="Semi-circle"
          description="startAngle=180 · endAngle=0 · label=percent"
        >
          <FluxionPieChart
            data={STATUS_DATA}
            outerRadius={80}
            innerRadius={40}
            startAngle={180}
            endAngle={0}
            paddingAngle={2}
            size={200}
            label="percent"
            labelLine
            tooltip
            legend
            legendPosition="bottom"
          />
        </Section>
      </div>

      {/* Row 2: Variants */}
      <div style={{ display: "flex", gap: 16, padding: "16px 20px 20px", flexShrink: 0 }}>
        <Section
          title="Rounded corners"
          description="cornerRadius=10 · paddingAngle=4 · label=value"
        >
          <FluxionPieChart
            data={SYSTEM_DATA}
            outerRadius={80}
            paddingAngle={4}
            cornerRadius={10}
            size={200}
            label="value"
            tooltip
            legend
            legendPosition="bottom"
          />
        </Section>

        <Section
          title="Legend: right"
          description="legendPosition=right · label off · tooltip"
        >
          <FluxionPieChart
            data={TASK_DATA}
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
            size={180}
            tooltip
            legend
            legendPosition="right"
          />
        </Section>

        <Section
          title="Custom label"
          description="label as function: name + value"
        >
          <FluxionPieChart
            data={STATUS_DATA}
            outerRadius={80}
            size={200}
            label={(slice, pct) => `${slice.name} ${pct.toFixed(0)}%`}
            labelLine
            tooltip
          />
        </Section>
      </div>
    </div>
  );
}
