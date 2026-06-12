import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DvrBadge } from "./dvr-badge";

const FIXED_T = new Date("2026-06-02T12:34:56").getTime();

describe("DvrBadge", () => {
  it("renders the default label", () => {
    const { container } = render(<DvrBadge currentT={FIXED_T} />);
    expect(container.querySelector("span")!.textContent).toMatch(/▶ TIME-TRAVEL/);
  });

  it("renders a custom label", () => {
    const { container } = render(<DvrBadge currentT={FIXED_T} label="⏪ REPLAY" />);
    expect(container.querySelector("span")!.textContent).toMatch(/⏪ REPLAY/);
  });

  it("formats currentT using the default formatter", () => {
    const { container } = render(<DvrBadge currentT={FIXED_T} />);
    // The text should contain a time string (HH:MM:SS pattern)
    expect(container.querySelector("span")!.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("uses a custom formatTime prop", () => {
    const format = (t: number) => `T=${t}`;
    const { container } = render(<DvrBadge currentT={FIXED_T} formatTime={format} />);
    expect(container.querySelector("span")!.textContent).toBe(
      `▶ TIME-TRAVEL @ T=${FIXED_T}`,
    );
  });

  it("applies textColor to the span style", () => {
    const { container } = render(<DvrBadge currentT={FIXED_T} textColor="#ff0000" />);
    // happy-dom preserves the raw style string, not the computed value
    expect(container.querySelector("span")!.getAttribute("style")).toContain(
      "color: #ff0000",
    );
  });

  it("applies custom style override", () => {
    const { container } = render(
      <DvrBadge currentT={FIXED_T} style={{ fontSize: 20 }} />,
    );
    expect(container.querySelector("span")!.style.fontSize).toBe("20px");
  });

  it("uses borderColor when provided, falls back to textColor", () => {
    const { container: c1 } = render(
      <DvrBadge currentT={FIXED_T} textColor="#aaa" borderColor="#bbb" />,
    );
    expect(c1.querySelector("span")!.getAttribute("style")).toContain("#bbb");

    const { container: c2 } = render(<DvrBadge currentT={FIXED_T} textColor="#aaa" />);
    // borderColor falls back to textColor
    const style = c2.querySelector("span")!.getAttribute("style")!;
    const borderMatches = [...style.matchAll(/#aaa/g)];
    expect(borderMatches.length).toBeGreaterThanOrEqual(2); // color + border
  });
});
