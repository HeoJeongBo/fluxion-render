import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DvrScrubber } from "./dvr-scrubber";

const MIN = new Date("2026-06-02T12:00:00").getTime();
const MAX = new Date("2026-06-02T12:10:00").getTime(); // +600_000ms
const VALUE = new Date("2026-06-02T12:05:00").getTime();

function baseProps() {
  return {
    min: MIN,
    max: MAX,
    value: VALUE,
    disabled: false,
    onChange: vi.fn(),
    onCommit: vi.fn(),
    isLive: true as boolean,
  };
}

describe("DvrScrubber", () => {
  it("renders an input[type=range] with min/max/step/value (live defaults)", () => {
    const { container } = render(<DvrScrubber {...baseProps()} />);
    const input = container.querySelector("input")!;
    expect(input.getAttribute("type")).toBe("range");
    expect(input.getAttribute("min")).toBe(String(MIN));
    expect(input.getAttribute("max")).toBe(String(MAX));
    expect(input.getAttribute("step")).toBe("1000");
    expect(input.getAttribute("value")).toBe(String(VALUE));
  });

  it("shows the live badge and HH:MM:SS labels in live mode", () => {
    const { container } = render(<DvrScrubber {...baseProps()} isLive />);
    const text = container.textContent ?? "";
    expect(text).toContain("● LIVE · ");
    // three timestamp labels, each HH:MM:SS
    expect([...text.matchAll(/\d{2}:\d{2}:\d{2}/g)].length).toBeGreaterThanOrEqual(3);
  });

  it("applies the live accent color to the input", () => {
    const { container } = render(
      <DvrScrubber {...baseProps()} isLive liveAccentColor="#abcdef" />,
    );
    expect(container.querySelector("input")!.getAttribute("style")).toContain(
      "accent-color: #abcdef",
    );
  });

  it("uses dvr accent + dvrTextColor and hides the badge in DVR mode", () => {
    const { container } = render(
      <DvrScrubber
        {...baseProps()}
        isLive={false}
        dvrAccentColor="#123456"
        dvrTextColor="#654321"
        formatTime={(t) => `T${t}`}
        style={{ paddingTop: 8 }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("● LIVE · ");
    // custom formatter used
    expect(text).toContain(`T${VALUE}`);
    // dvr accent on the input
    expect(container.querySelector("input")!.getAttribute("style")).toContain(
      "accent-color: #123456",
    );
    // centre span carries dvrTextColor
    const spans = [...container.querySelectorAll("span")];
    const centre = spans.find((s) => (s.getAttribute("style") ?? "").includes("#654321"));
    expect(centre).toBeTruthy();
    // outer style override applied
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.paddingTop).toBe("8px");
  });

  it("leaves the centre label uncolored when dvrTextColor is undefined", () => {
    const { container } = render(<DvrScrubber {...baseProps()} isLive={false} />);
    // centre span is the middle of three; with no centreColor it has no inline color
    const spans = [...container.querySelectorAll("span")];
    expect(spans).toHaveLength(3);
    expect(spans[1]!.getAttribute("style")).toBeNull();
  });

  it("disables the input and sets not-allowed cursor when disabled", () => {
    const { container } = render(<DvrScrubber {...baseProps()} disabled />);
    const input = container.querySelector("input")!;
    expect(input.hasAttribute("disabled")).toBe(true);
    expect(input.getAttribute("style")).toContain("cursor: not-allowed");
  });

  it("wires onChange and onCommit to the input events", () => {
    const props = baseProps();
    const { container } = render(<DvrScrubber {...props} />);
    const input = container.querySelector("input")!;
    // Controlled input — change to a DIFFERENT value so React fires onChange.
    fireEvent.change(input, { target: { value: String(VALUE + 1000) } });
    expect(props.onChange).toHaveBeenCalled();
    fireEvent.mouseUp(input);
    fireEvent.touchEnd(input);
    fireEvent.keyUp(input);
    expect(props.onCommit).toHaveBeenCalledTimes(3);
  });

  // ── Segment overlay ─────────────────────────────────────────────────────────

  it("renders no segment overlay by default", () => {
    const { container } = render(<DvrScrubber {...baseProps()} />);
    // Only the input wrapper div + label div + label spans — no absolute bars.
    const absoluteDivs = [...container.querySelectorAll("div")].filter((d) =>
      (d.getAttribute("style") ?? "").includes("position: absolute"),
    );
    expect(absoluteDivs).toHaveLength(0);
  });

  it("renders one bar per segment with computed left/width, skipping width<=0", () => {
    const { container } = render(
      <DvrScrubber
        {...baseProps()}
        isLive={false}
        dvrAccentColor="#00ff00"
        segments={[
          // 0% .. 50% of the 600_000ms window
          { start: MIN, end: MIN + 300_000 },
          // open segment 75% .. 100% (end null → extends to max)
          { start: MIN + 450_000, end: null },
          // zero-width (start == end) → skipped
          { start: MIN + 100_000, end: MIN + 100_000 },
          // fully outside the window on the right → clipped to width<=0, skipped
          { start: MAX + 10_000, end: MAX + 20_000 },
        ]}
      />,
    );
    const bars = [...container.querySelectorAll("div")].filter((d) => {
      const s = d.getAttribute("style") ?? "";
      // Bars carry a percentage width; the overlay container does not.
      return s.includes("position: absolute") && /width:\s*\d/.test(s);
    });
    expect(bars).toHaveLength(2); // two valid segments
    const s0 = bars[0]!.getAttribute("style")!;
    expect(s0).toContain("left: 0%");
    expect(s0).toContain("width: 50%");
    expect(s0).toContain("background: #00ff00"); // dvr accent
    const s1 = bars[1]!.getAttribute("style")!;
    expect(s1).toContain("left: 75%");
    expect(s1).toContain("width: 25%");
  });

  it("renders no overlay when min === max (zero span)", () => {
    const { container } = render(
      <DvrScrubber
        {...baseProps()}
        min={MIN}
        max={MIN}
        value={MIN}
        segments={[{ start: MIN, end: MIN + 1000 }]}
      />,
    );
    const bars = [...container.querySelectorAll("div")].filter((d) =>
      (d.getAttribute("style") ?? "").includes("position: absolute"),
    );
    expect(bars).toHaveLength(0);
  });
});
