import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FluxionGauge, type GaugeThreshold } from "./fluxion-gauge";

const GREEN_THRESHOLDS: GaugeThreshold[] = [
  { value: 0, color: "#4caf50" },
  { value: 60, color: "#ffb060" },
  { value: 80, color: "#ff5252" },
];

function getTextContents(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("text")).map((t) => t.textContent ?? "");
}

describe("FluxionGauge — type=arc (default)", () => {
  it("renders an SVG element", () => {
    const { container } = render(<FluxionGauge value={50} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("shows value text by default", () => {
    const { container } = render(<FluxionGauge value={50} />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("50.0"))).toBe(true);
  });

  it("hides value text when showValue=false", () => {
    const { container } = render(<FluxionGauge value={50} showValue={false} />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("50.0"))).toBe(false);
  });

  it("renders label text when label is provided", () => {
    const { container } = render(<FluxionGauge value={50} label="CPU Usage" />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("CPU Usage"))).toBe(true);
  });

  it("does not render label text when label is omitted", () => {
    const { container } = render(<FluxionGauge value={50} />);
    const texts = getTextContents(container);
    expect(texts.every((t) => !t.includes("CPU Usage"))).toBe(true);
  });

  it("renders arc circle when fraction > 0", () => {
    const { container } = render(<FluxionGauge value={50} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
  });

  it("does not render value arc circle when value equals min", () => {
    const { container } = render(<FluxionGauge value={0} min={0} max={100} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });

  it("type=arc is the default when type is omitted", () => {
    const { container } = render(<FluxionGauge value={50} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("viewBox")).toContain("120");
  });
});

describe("FluxionGauge — type=circle", () => {
  it("renders SVG for circle type", () => {
    const { container } = render(<FluxionGauge value={75} type="circle" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("shows value text for circle type", () => {
    const { container } = render(<FluxionGauge value={75} type="circle" />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("75.0"))).toBe(true);
  });

  it("renders track and arc circles for non-zero value", () => {
    const { container } = render(<FluxionGauge value={50} type="circle" />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
  });

  it("renders only track circle for zero value", () => {
    const { container } = render(
      <FluxionGauge value={0} type="circle" min={0} max={100} />,
    );
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });

  it("renders label inside circle gauge", () => {
    const { container } = render(<FluxionGauge value={50} type="circle" label="Speed" />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("Speed"))).toBe(true);
  });

  it("respects showValue=false for circle type", () => {
    const { container } = render(
      <FluxionGauge value={50} type="circle" showValue={false} />,
    );
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("50.0"))).toBe(false);
  });
});

describe("FluxionGauge — type=bar", () => {
  it("renders SVG for bar type", () => {
    const { container } = render(<FluxionGauge value={40} type="bar" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("shows value text for bar type", () => {
    const { container } = render(<FluxionGauge value={40} type="bar" />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("40.0"))).toBe(true);
  });

  it("renders track rect and value rect for non-zero value", () => {
    const { container } = render(<FluxionGauge value={50} type="bar" />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(2);
  });

  it("renders only track rect for zero value", () => {
    const { container } = render(<FluxionGauge value={0} type="bar" min={0} max={100} />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(1);
  });

  it("renders label for bar gauge when provided", () => {
    const { container } = render(<FluxionGauge value={50} type="bar" label="Memory" />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("Memory"))).toBe(true);
  });

  it("respects showValue=false for bar type", () => {
    const { container } = render(
      <FluxionGauge value={50} type="bar" showValue={false} />,
    );
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("50.0"))).toBe(false);
  });

  it("adjusts SVG height to include label space when label is provided", () => {
    const { container: withLabel } = render(
      <FluxionGauge value={50} type="bar" label="test" barHeight={20} />,
    );
    const { container: noLabel } = render(
      <FluxionGauge value={50} type="bar" barHeight={20} />,
    );
    const svgWithLabel = withLabel.querySelector("svg")!;
    const svgNoLabel = noLabel.querySelector("svg")!;
    const hWith = Number(svgWithLabel.getAttribute("height"));
    const hNo = Number(svgNoLabel.getAttribute("height"));
    expect(hWith).toBeGreaterThan(hNo);
  });
});

describe("FluxionGauge — threshold coloring", () => {
  it("uses first threshold color for value at min (green zone)", () => {
    const { container } = render(
      <FluxionGauge value={30} thresholds={GREEN_THRESHOLDS} />,
    );
    const circles = container.querySelectorAll("circle");
    const arcCircle = circles[1] as SVGCircleElement;
    expect(arcCircle.getAttribute("stroke")).toBe("#4caf50");
  });

  it("uses second threshold color for value in middle zone (yellow)", () => {
    const { container } = render(
      <FluxionGauge value={70} thresholds={GREEN_THRESHOLDS} />,
    );
    const circles = container.querySelectorAll("circle");
    const arcCircle = circles[1] as SVGCircleElement;
    expect(arcCircle.getAttribute("stroke")).toBe("#ffb060");
  });

  it("uses last threshold color for value in high zone (red)", () => {
    const { container } = render(
      <FluxionGauge value={90} thresholds={GREEN_THRESHOLDS} />,
    );
    const circles = container.querySelectorAll("circle");
    const arcCircle = circles[1] as SVGCircleElement;
    expect(arcCircle.getAttribute("stroke")).toBe("#ff5252");
  });

  it("uses threshold color at exact threshold boundary (60 → yellow)", () => {
    const { container } = render(
      <FluxionGauge value={60} thresholds={GREEN_THRESHOLDS} />,
    );
    const circles = container.querySelectorAll("circle");
    const arcCircle = circles[1] as SVGCircleElement;
    expect(arcCircle.getAttribute("stroke")).toBe("#ffb060");
  });

  it("uses threshold color at exactly the upper boundary (80 → red)", () => {
    const { container } = render(
      <FluxionGauge value={80} thresholds={GREEN_THRESHOLDS} />,
    );
    const circles = container.querySelectorAll("circle");
    const arcCircle = circles[1] as SVGCircleElement;
    expect(arcCircle.getAttribute("stroke")).toBe("#ff5252");
  });

  it("bar gauge also uses threshold color", () => {
    const { container } = render(
      <FluxionGauge value={90} type="bar" thresholds={GREEN_THRESHOLDS} />,
    );
    const rects = container.querySelectorAll("rect");
    const arcRect = rects[1] as SVGRectElement;
    expect(arcRect.getAttribute("fill")).toBe("#ff5252");
  });
});

describe("FluxionGauge — min/max clamping", () => {
  it("clamps value above max to full arc", () => {
    const { container } = render(<FluxionGauge value={200} min={0} max={100} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2);
  });

  it("clamps value below min to empty arc", () => {
    const { container } = render(<FluxionGauge value={-50} min={0} max={100} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });

  it("renders value text with custom min/max", () => {
    const { container } = render(<FluxionGauge value={25} min={0} max={50} />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("25.0"))).toBe(true);
  });

  it("respects custom min value — value at min shows no arc", () => {
    const { container } = render(<FluxionGauge value={10} min={10} max={100} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
  });
});

describe("FluxionGauge — valueFormat", () => {
  it("uses custom valueFormat function", () => {
    const { container } = render(
      <FluxionGauge value={42.7} valueFormat={(v) => `${Math.round(v)}%`} />,
    );
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("43%"))).toBe(true);
  });

  it("defaults to one decimal place format", () => {
    const { container } = render(<FluxionGauge value={33} />);
    const texts = getTextContents(container);
    expect(texts.some((t) => t.includes("33.0"))).toBe(true);
  });
});

describe("FluxionGauge — className and style props", () => {
  it("applies className to wrapper div", () => {
    const { container } = render(<FluxionGauge value={50} className="gauge-wrapper" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains("gauge-wrapper")).toBe(true);
  });

  it("applies custom style to wrapper div", () => {
    const { container } = render(<FluxionGauge value={50} style={{ margin: "10px" }} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.margin).toBe("10px");
  });

  it("classNames.root overrides className on wrapper div", () => {
    const { container } = render(
      <FluxionGauge value={50} className="ignored" classNames={{ root: "root-class" }} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains("root-class")).toBe(true);
    expect(wrapper.classList.contains("ignored")).toBe(false);
  });

  it("classNames.track applies to track circle", () => {
    const { container } = render(
      <FluxionGauge value={50} classNames={{ track: "my-track" }} />,
    );
    const trackEl = container.querySelector(".my-track");
    expect(trackEl).toBeTruthy();
  });

  it("classNames.arc applies to arc circle", () => {
    const { container } = render(
      <FluxionGauge value={50} classNames={{ arc: "my-arc" }} />,
    );
    const arcEl = container.querySelector(".my-arc");
    expect(arcEl).toBeTruthy();
  });
});

describe("FluxionGauge — size prop", () => {
  it("respects custom size for arc gauge", () => {
    const { container } = render(<FluxionGauge value={50} size={200} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("200");
    expect(svg.getAttribute("height")).toBe("200");
  });

  it("respects custom size for circle gauge", () => {
    const { container } = render(<FluxionGauge value={50} type="circle" size={150} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("150");
    expect(svg.getAttribute("height")).toBe("150");
  });
});
