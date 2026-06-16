import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CrosshairState } from "../model/use-fluxion-crosshair";
import { FluxionCrosshair } from "./fluxion-crosshair";

const HIDDEN_STATE: CrosshairState = { position: null, points: [] };

const VISIBLE_STATE: CrosshairState = {
  position: { pxX: 100, pxY: 50 },
  points: [
    {
      layerId: "layer-a",
      label: "Series A",
      color: "#ff0000",
      t: 1000,
      y: 42.5,
      xLabel: "t=1000",
      yLabel: "42.5000",
    },
  ],
};

const TWO_POINT_STATE: CrosshairState = {
  position: { pxX: 80, pxY: 30 },
  points: [
    {
      layerId: "l1",
      label: "Alpha",
      color: "#0f0",
      t: 500,
      y: 10,
      xLabel: "t=500",
      yLabel: "10.0000",
    },
    {
      layerId: "l2",
      label: "Beta",
      color: "#00f",
      t: 500,
      y: 20,
      xLabel: "t=500",
      yLabel: "20.0000",
    },
  ],
};

function getTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*"))
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent ?? "");
}

describe("FluxionCrosshair — hidden state", () => {
  it("renders the outer container div even when position is null", () => {
    const { container } = render(<FluxionCrosshair state={HIDDEN_STATE} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("does not render SVG lines when position is null", () => {
    const { container } = render(<FluxionCrosshair state={HIDDEN_STATE} />);
    expect(container.querySelectorAll("svg").length).toBe(0);
  });

  it("does not render tooltip when position is null", () => {
    const { container } = render(<FluxionCrosshair state={HIDDEN_STATE} />);
    expect(container.querySelectorAll("div").length).toBe(1);
  });
});

describe("FluxionCrosshair — visible state", () => {
  it("renders SVG when position is set", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders vertical line at pxX", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    const lines = container.querySelectorAll("line");
    const vLine = Array.from(lines).find(
      (l) => l.getAttribute("x1") === "100" && l.getAttribute("x2") === "100",
    );
    expect(vLine).toBeTruthy();
  });

  it("renders horizontal line at pxY", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    const lines = container.querySelectorAll("line");
    const hLine = Array.from(lines).find(
      (l) => l.getAttribute("y1") === "50" && l.getAttribute("y2") === "50",
    );
    expect(hLine).toBeTruthy();
  });

  it("renders a circle dot for each point", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(1);
    expect(circles[0]!.getAttribute("fill")).toBe("#ff0000");
  });

  it("renders tooltip xLabel as header text", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    const texts = getTexts(container);
    expect(texts.some((t) => t.includes("t=1000"))).toBe(true);
  });

  it("renders tooltip point label", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    const texts = getTexts(container);
    expect(texts.some((t) => t.includes("Series A"))).toBe(true);
  });

  it("renders tooltip yLabel", () => {
    const { container } = render(<FluxionCrosshair state={VISIBLE_STATE} />);
    const texts = getTexts(container);
    expect(texts.some((t) => t.includes("42.5000"))).toBe(true);
  });
});

describe("FluxionCrosshair — className and style passthrough", () => {
  it("applies className to the outer container", () => {
    const { container } = render(
      <FluxionCrosshair state={HIDDEN_STATE} className="my-crosshair" />,
    );
    expect((container.firstChild as HTMLElement).classList.contains("my-crosshair")).toBe(
      true,
    );
  });

  it("merges custom style into the outer container", () => {
    const { container } = render(
      <FluxionCrosshair state={HIDDEN_STATE} style={{ width: 300, height: 200 }} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("300px");
    expect(el.style.height).toBe("200px");
  });

  it("always sets pointerEvents none on the outer container", () => {
    const { container } = render(<FluxionCrosshair state={HIDDEN_STATE} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.pointerEvents).toBe("none");
  });
});

describe("FluxionCrosshair — tooltip empty entries", () => {
  it("does not render tooltip when points array is empty but position is set", () => {
    const stateNoPoints: CrosshairState = {
      position: { pxX: 50, pxY: 50 },
      points: [],
    };
    const { container } = render(<FluxionCrosshair state={stateNoPoints} />);
    const svgEls = container.querySelectorAll("svg");
    expect(svgEls.length).toBe(1);
    const allDivs = container.querySelectorAll("div");
    expect(allDivs.length).toBe(1);
  });
});

describe("FluxionCrosshair — multiple points", () => {
  it("renders one circle per point", () => {
    const { container } = render(<FluxionCrosshair state={TWO_POINT_STATE} />);
    expect(container.querySelectorAll("circle").length).toBe(2);
  });

  it("renders all point labels in the tooltip", () => {
    const { container } = render(<FluxionCrosshair state={TWO_POINT_STATE} />);
    const texts = getTexts(container);
    expect(texts.some((t) => t.includes("Alpha"))).toBe(true);
    expect(texts.some((t) => t.includes("Beta"))).toBe(true);
  });

  it("renders all yLabels in the tooltip", () => {
    const { container } = render(<FluxionCrosshair state={TWO_POINT_STATE} />);
    const texts = getTexts(container);
    expect(texts.some((t) => t.includes("10.0000"))).toBe(true);
    expect(texts.some((t) => t.includes("20.0000"))).toBe(true);
  });

  it("renders shared xLabel in the header", () => {
    const { container } = render(<FluxionCrosshair state={TWO_POINT_STATE} />);
    const texts = getTexts(container);
    expect(texts.some((t) => t.includes("t=500"))).toBe(true);
  });
});

describe("FluxionCrosshair — tooltip flip logic", () => {
  it("tooltip uses left offset when pxX is small (no flip)", () => {
    const state: CrosshairState = {
      position: { pxX: 10, pxY: 200 },
      points: [
        { layerId: "a", label: "A", color: "#f00", t: 0, y: 1, xLabel: "x", yLabel: "y" },
      ],
    };
    const { container } = render(<FluxionCrosshair state={state} />);
    const tooltipDiv = container.querySelectorAll("div")[1] as HTMLElement;
    expect(tooltipDiv).toBeTruthy();
    expect(tooltipDiv.style.left).toBeTruthy();
    expect(tooltipDiv.style.right).toBeFalsy();
  });

  it("tooltip flips up when pxY is too small", () => {
    const state: CrosshairState = {
      position: { pxX: 10, pxY: 10 },
      points: [
        { layerId: "a", label: "A", color: "#f00", t: 0, y: 1, xLabel: "x", yLabel: "y" },
      ],
    };
    const { container } = render(<FluxionCrosshair state={state} />);
    const tooltipDiv = container.querySelectorAll("div")[1] as HTMLElement;
    expect(tooltipDiv.style.top).toBeTruthy();
    expect(tooltipDiv.style.bottom).toBeFalsy();
  });

  it("tooltip uses bottom offset when pxY is large enough", () => {
    const state: CrosshairState = {
      position: { pxX: 10, pxY: 200 },
      points: [
        { layerId: "a", label: "A", color: "#f00", t: 0, y: 1, xLabel: "x", yLabel: "y" },
      ],
    };
    const { container } = render(<FluxionCrosshair state={state} />);
    const tooltipDiv = container.querySelectorAll("div")[1] as HTMLElement;
    expect(tooltipDiv.style.bottom).toBeTruthy();
    expect(tooltipDiv.style.top).toBeFalsy();
  });
});

describe("FluxionCrosshair — custom visual props", () => {
  it("applies custom lineColor to SVG lines", () => {
    const { container } = render(
      <FluxionCrosshair state={VISIBLE_STATE} lineColor="#abcdef" />,
    );
    const lines = container.querySelectorAll("line");
    const allHaveColor = Array.from(lines).every(
      (l) => l.getAttribute("stroke") === "#abcdef",
    );
    expect(allHaveColor).toBe(true);
  });

  it("applies custom lineWidth to SVG lines", () => {
    const { container } = render(
      <FluxionCrosshair state={VISIBLE_STATE} lineWidth={3} />,
    );
    const lines = container.querySelectorAll("line");
    const allHaveWidth = Array.from(lines).every(
      (l) => l.getAttribute("stroke-width") === "3",
    );
    expect(allHaveWidth).toBe(true);
  });

  it("applies custom tooltipBg to tooltip element", () => {
    const bg = "rgba(0,0,0,0.99)";
    const { container } = render(
      <FluxionCrosshair state={VISIBLE_STATE} tooltipBg={bg} />,
    );
    const tooltipEl = container.querySelectorAll("div")[1] as HTMLElement;
    expect(tooltipEl.style.background).toBeTruthy();
  });

  it("flips the tooltip to the left edge at a far-right cursor position", () => {
    // pxX large enough to trip the flipX guard → tooltip anchored via `right`.
    const farRight: CrosshairState = {
      position: { pxX: 10000, pxY: 5 }, // pxY small → also trips flipY
      points: VISIBLE_STATE.points,
    };
    const { container } = render(<FluxionCrosshair state={farRight} />);
    const tooltipEl = container.querySelectorAll("div")[1] as HTMLElement;
    // flipX → `right` is set and `left` is cleared.
    expect(tooltipEl.style.right).not.toBe("");
    expect(tooltipEl.style.left).toBe("");
  });
});
