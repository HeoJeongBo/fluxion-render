import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { FluxionLegend, type LegendItem } from "./fluxion-legend";

const ITEMS: LegendItem[] = [
  { color: "#ff0000", label: "CPU" },
  { color: "#00ff00", label: "RAM" },
  { color: "#0000ff", label: "GPU" },
];

const SINGLE_ITEM: LegendItem[] = [{ color: "#abcdef", label: "Metric" }];

function getLegendEl(container: HTMLElement): HTMLElement {
  return container.firstChild as HTMLElement;
}

function isOpaque(el: HTMLElement): boolean {
  return el.outerHTML.includes("opacity: 1") || el.outerHTML.includes("opacity:1");
}

function isHidden(el: HTMLElement): boolean {
  return el.outerHTML.includes("opacity: 0") || el.outerHTML.includes("opacity:0");
}

describe("FluxionLegend — renders items", () => {
  it("renders all item labels", () => {
    const { container } = render(<FluxionLegend items={ITEMS} />);
    const html = container.innerHTML;
    expect(html).toContain("CPU");
    expect(html).toContain("RAM");
    expect(html).toContain("GPU");
  });

  it("renders correct number of item rows", () => {
    const { container } = render(<FluxionLegend items={ITEMS} />);
    const root = getLegendEl(container);
    expect(root.children.length).toBe(ITEMS.length);
  });

  it("renders empty legend with no items", () => {
    const { container } = render(<FluxionLegend items={[]} />);
    const root = getLegendEl(container);
    expect(root.children.length).toBe(0);
  });

  it("renders color dot spans for each item", () => {
    const { container } = render(<FluxionLegend items={ITEMS} />);
    const dots = container.querySelectorAll("span");
    expect(dots.length).toBe(ITEMS.length * 2);
  });

  it("applies background color to dot span in outerHTML", () => {
    const { container } = render(<FluxionLegend items={SINGLE_ITEM} />);
    expect(container.innerHTML).toContain("#abcdef");
  });
});

describe("FluxionLegend — visibility=always", () => {
  it("is visible by default (visibility=always)", () => {
    const { container } = render(<FluxionLegend items={ITEMS} />);
    const root = getLegendEl(container);
    expect(isOpaque(root)).toBe(true);
  });

  it("is visible when visibility=always is explicit", () => {
    const { container } = render(<FluxionLegend items={ITEMS} visibility="always" />);
    const root = getLegendEl(container);
    expect(isOpaque(root)).toBe(true);
  });

  it("does not hide on mouse leave when visibility=always", () => {
    const { container } = render(
      <div>
        <FluxionLegend items={ITEMS} visibility="always" />
      </div>,
    );
    const parent = container.firstChild as HTMLElement;
    act(() => {
      parent.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    });
    const root = parent.firstChild as HTMLElement;
    expect(isOpaque(root)).toBe(true);
  });
});

describe("FluxionLegend — visibility=hover", () => {
  it("is hidden initially when visibility=hover", () => {
    const { container } = render(
      <div>
        <FluxionLegend items={ITEMS} visibility="hover" />
      </div>,
    );
    const legendEl = (container.firstChild as HTMLElement).firstChild as HTMLElement;
    expect(isHidden(legendEl)).toBe(true);
  });

  it("becomes visible when parent element receives mouseenter", () => {
    const { container } = render(
      <div>
        <FluxionLegend items={ITEMS} visibility="hover" />
      </div>,
    );
    const parent = container.firstChild as HTMLElement;
    act(() => {
      parent.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    });
    const legendEl = parent.firstChild as HTMLElement;
    expect(isOpaque(legendEl)).toBe(true);
  });

  it("hides again when parent element receives mouseleave after mouseenter", () => {
    const { container } = render(
      <div>
        <FluxionLegend items={ITEMS} visibility="hover" />
      </div>,
    );
    const parent = container.firstChild as HTMLElement;
    act(() => {
      parent.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    });
    act(() => {
      parent.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    });
    const legendEl = parent.firstChild as HTMLElement;
    expect(isHidden(legendEl)).toBe(true);
  });

  it("uses containerRef element for hover when provided", () => {
    function Wrapper() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <div>
          <div ref={ref} data-testid="container" />
          <FluxionLegend items={ITEMS} visibility="hover" containerRef={ref} />
        </div>
      );
    }
    const { container } = render(<Wrapper />);
    const outer = container.firstChild as HTMLElement;
    const containerEl = outer.firstChild as HTMLElement;
    act(() => {
      containerEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    });
    const legendEl = outer.lastChild as HTMLElement;
    expect(isOpaque(legendEl)).toBe(true);
  });
});

describe("FluxionLegend — position prop", () => {
  it("positions at top-right by default", () => {
    const { container } = render(<FluxionLegend items={ITEMS} />);
    const html = container.innerHTML;
    expect(html).toContain("top: 8px");
    expect(html).toContain("right: 8px");
  });

  it("positions at top-left", () => {
    const { container } = render(<FluxionLegend items={ITEMS} position="top-left" />);
    const html = container.innerHTML;
    expect(html).toContain("top: 8px");
    expect(html).toContain("left: 8px");
    expect(html).not.toContain("right: 8px");
  });

  it("positions at bottom-left", () => {
    const { container } = render(<FluxionLegend items={ITEMS} position="bottom-left" />);
    const html = container.innerHTML;
    expect(html).toContain("bottom: 8px");
    expect(html).toContain("left: 8px");
    expect(html).not.toContain("top: 8px");
    expect(html).not.toContain("right: 8px");
  });

  it("positions at bottom-right", () => {
    const { container } = render(<FluxionLegend items={ITEMS} position="bottom-right" />);
    const html = container.innerHTML;
    expect(html).toContain("bottom: 8px");
    expect(html).toContain("right: 8px");
    expect(html).not.toContain("top: 8px");
    expect(html).not.toContain("left: 8px");
  });

  it("positions at top-right explicitly", () => {
    const { container } = render(<FluxionLegend items={ITEMS} position="top-right" />);
    const html = container.innerHTML;
    expect(html).toContain("top: 8px");
    expect(html).toContain("right: 8px");
    expect(html).not.toContain("bottom:");
    expect(html).not.toContain("left: 8px");
  });
});

describe("FluxionLegend — className props", () => {
  it("applies className to root element", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} className="legend-root" />,
    );
    const root = getLegendEl(container);
    expect(root.classList.contains("legend-root")).toBe(true);
  });

  it("classNames.root overrides className", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} className="ignored" classNames={{ root: "custom-root" }} />,
    );
    const root = getLegendEl(container);
    expect(root.classList.contains("custom-root")).toBe(true);
    expect(root.classList.contains("ignored")).toBe(false);
  });

  it("classNames.item applies to each item row", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} classNames={{ item: "my-item" }} />,
    );
    const itemEls = container.querySelectorAll(".my-item");
    expect(itemEls.length).toBe(ITEMS.length);
  });

  it("classNames.dot applies to dot spans", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} classNames={{ dot: "my-dot" }} />,
    );
    const dotEls = container.querySelectorAll(".my-dot");
    expect(dotEls.length).toBe(ITEMS.length);
  });

  it("classNames.label applies to label spans", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} classNames={{ label: "my-label" }} />,
    );
    const labelEls = container.querySelectorAll(".my-label");
    expect(labelEls.length).toBe(ITEMS.length);
  });

  it("uses simplified style when classNames.root is set (no position: absolute)", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} classNames={{ root: "custom-root" }} />,
    );
    const root = getLegendEl(container);
    expect(root.outerHTML).not.toContain("position: absolute");
  });
});

describe("FluxionLegend — custom style", () => {
  it("merges custom style into the root element outerHTML", () => {
    const { container } = render(
      <FluxionLegend items={ITEMS} style={{ zIndex: 10 }} />,
    );
    const root = getLegendEl(container);
    expect(root.outerHTML).toContain("z-index: 10");
  });
});
