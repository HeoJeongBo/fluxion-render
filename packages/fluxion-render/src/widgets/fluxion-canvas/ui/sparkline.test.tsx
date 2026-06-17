import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sparkline } from "./sparkline";

afterEach(cleanup);

describe("Sparkline", () => {
  it("renders an empty svg for fewer than 2 points", () => {
    const { container } = render(<Sparkline data={[1]} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.querySelector("path")).toBeNull();
  });

  it("draws a polyline path for multiple points", () => {
    const { container } = render(<Sparkline data={[1, 2, 3, 2, 4]} />);
    const path = container.querySelector("path");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("d")).toMatch(/^M0/);
  });

  it("draws the last-point dot by default and omits it when showLast=false", () => {
    const withDot = render(<Sparkline data={[1, 2, 3]} />);
    expect(withDot.container.querySelector("circle")).toBeTruthy();
    cleanup();
    const noDot = render(<Sparkline data={[1, 2, 3]} showLast={false} />);
    expect(noDot.container.querySelector("circle")).toBeNull();
  });

  it("adds an area path when fillOpacity > 0", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} fillOpacity={0.3} />);
    // two paths: area + line
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("honours a fixed range and custom dimensions/color", () => {
    const { container } = render(
      <Sparkline
        data={[0, 5, 10]}
        range={[0, 10]}
        width={120}
        height={40}
        color="#f00"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("120");
    expect(svg?.getAttribute("height")).toBe("40");
    expect(container.querySelector("path")?.getAttribute("stroke")).toBe("#f00");
  });

  it("handles flat data without dividing by zero", () => {
    const { container } = render(<Sparkline data={[5, 5, 5]} />);
    expect(container.querySelector("path")).toBeTruthy();
  });
});
