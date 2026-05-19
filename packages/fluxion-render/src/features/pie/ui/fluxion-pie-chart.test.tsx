import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  _polarToXY,
  _toRad,
  describeSlice,
  FluxionPieChart,
  type PieSlice,
} from "./fluxion-pie-chart";

// ── _toRad ────────────────────────────────────────────────────────────────────

describe("_toRad", () => {
  it("converts 0° to 0", () => {
    expect(_toRad(0)).toBe(0);
  });
  it("converts 180° to π", () => {
    expect(_toRad(180)).toBeCloseTo(Math.PI);
  });
  it("converts 360° to 2π", () => {
    expect(_toRad(360)).toBeCloseTo(2 * Math.PI);
  });
});

// ── _polarToXY ────────────────────────────────────────────────────────────────

describe("_polarToXY", () => {
  const cx = 100;
  const cy = 100;
  const r = 50;

  it("90° points to the top (12 o'clock)", () => {
    const { x, y } = _polarToXY(cx, cy, r, 90);
    expect(x).toBeCloseTo(cx);
    expect(y).toBeCloseTo(cy - r);
  });

  it("0° points to the right", () => {
    const { x, y } = _polarToXY(cx, cy, r, 0);
    expect(x).toBeCloseTo(cx + r);
    expect(y).toBeCloseTo(cy);
  });

  it("180° points to the left", () => {
    const { x, y } = _polarToXY(cx, cy, r, 180);
    expect(x).toBeCloseTo(cx - r);
    expect(y).toBeCloseTo(cy);
  });

  it("270° points to the bottom", () => {
    const { x, y } = _polarToXY(cx, cy, r, 270);
    expect(x).toBeCloseTo(cx);
    expect(y).toBeCloseTo(cy + r);
  });
});

// ── describeSlice ─────────────────────────────────────────────────────────────

describe("describeSlice", () => {
  const cx = 100;
  const cy = 100;

  it("returns empty string for near-zero sweep", () => {
    expect(describeSlice(cx, cy, 0, 80, 90, 90.0001)).toBe("");
  });

  it("returns a non-empty path for a solid pie slice", () => {
    const d = describeSlice(cx, cy, 0, 80, 90, 0);
    expect(d).toBeTruthy();
    expect(d).toContain("M");
    expect(d).toContain("A");
    expect(d).toContain("Z");
  });

  it("solid pie starts from center (M cx cy)", () => {
    const d = describeSlice(cx, cy, 0, 80, 90, 0);
    expect(d).toMatch(/M 100 100/);
  });

  it("donut slice does not start from center", () => {
    const d = describeSlice(cx, cy, 40, 80, 90, 0);
    expect(d).not.toMatch(/M 100 100/);
    expect((d.match(/\bA\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("uses large-arc-flag=1 for sweep > 180°", () => {
    const d = describeSlice(cx, cy, 0, 80, 90, -100); // 190° sweep
    expect(d).toMatch(/A 80 80 0 1/);
  });

  it("uses large-arc-flag=0 for sweep <= 180°", () => {
    const d = describeSlice(cx, cy, 0, 80, 90, -80); // 170° sweep
    expect(d).toMatch(/A 80 80 0 0/);
  });
});

// ── Label variants ────────────────────────────────────────────────────────────

const SINGLE: PieSlice[] = [{ name: "Alpha", value: 100 }];

describe("FluxionPieChart label variants", () => {
  it('label="name" renders slice name', () => {
    render(<FluxionPieChart data={SINGLE} label="name" tooltip={false} />);
    expect(screen.queryByText("Alpha")).toBeTruthy();
  });

  it('label="percent" renders 100.0%', () => {
    render(<FluxionPieChart data={SINGLE} label="percent" tooltip={false} />);
    expect(screen.queryByText("100.0%")).toBeTruthy();
  });

  it('label="value" renders raw value', () => {
    render(<FluxionPieChart data={SINGLE} label="value" tooltip={false} />);
    expect(screen.queryByText("100")).toBeTruthy();
  });

  it("label as function renders custom text", () => {
    render(
      <FluxionPieChart
        data={SINGLE}
        label={(s) => `${s.name}!`}
        tooltip={false}
      />,
    );
    expect(screen.queryByText("Alpha!")).toBeTruthy();
  });
});

// ── Legend ────────────────────────────────────────────────────────────────────

describe("FluxionPieChart legend", () => {
  const DATA: PieSlice[] = [
    { name: "CPU", value: 40 },
    { name: "RAM", value: 60 },
  ];

  it("renders legend items when legend=true", () => {
    render(<FluxionPieChart data={DATA} legend tooltip={false} />);
    expect(screen.queryByText("CPU")).toBeTruthy();
    expect(screen.queryByText("RAM")).toBeTruthy();
  });

  it("does not render legend when legend=false", () => {
    const { container } = render(<FluxionPieChart data={DATA} legend={false} tooltip={false} />);
    const htmlText = Array.from(container.querySelectorAll("*"))
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent ?? "");
    expect(htmlText.some((t) => t.includes("CPU"))).toBe(false);
  });
});

// ── Donut center text ─────────────────────────────────────────────────────────

describe("FluxionPieChart donut center", () => {
  it("renders centerValue and centerLabel inside donut", () => {
    const { container } = render(
      <FluxionPieChart
        data={SINGLE}
        innerRadius={40}
        outerRadius={80}
        centerValue="42"
        centerLabel="Total"
        tooltip={false}
      />,
    );
    expect(container.querySelector("text")?.textContent).toBeTruthy();
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("42");
    expect(texts).toContain("Total");
  });

  it("does not render center text when innerRadius=0", () => {
    const { container } = render(
      <FluxionPieChart
        data={SINGLE}
        innerRadius={0}
        centerValue="42"
        centerLabel="Total"
        tooltip={false}
      />,
    );
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).not.toContain("42");
    expect(texts).not.toContain("Total");
  });
});

// ── Slice count ───────────────────────────────────────────────────────────────

describe("FluxionPieChart slice rendering", () => {
  it("renders one <path> per positive-value slice", () => {
    const data: PieSlice[] = [
      { name: "A", value: 10 },
      { name: "B", value: 20 },
      { name: "C", value: 0 }, // filtered out
    ];
    const { container } = render(
      <FluxionPieChart data={data} tooltip={false} />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(2);
  });
});
