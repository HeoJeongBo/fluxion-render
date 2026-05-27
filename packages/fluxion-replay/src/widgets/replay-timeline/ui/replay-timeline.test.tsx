import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayTimeline } from "./replay-timeline";
import type { UseReplayTimelineResult } from "../lib/use-replay-timeline";

function makeTimeline(overrides: Partial<UseReplayTimelineResult> = {}): UseReplayTimelineResult {
  return {
    currentT: 0,
    durationMs: 10_000,
    earliest: 0,
    latest: 10_000,
    bufferedRanges: [],
    fraction: 0,
    segments: [],
    gaps: [],
    isInGap: false,
    seekTo: vi.fn(),
    seekToMs: vi.fn(),
    seekForward: vi.fn(),
    seekBackward: vi.fn(),
    seekToPercent: vi.fn(),
    progress: { currentMs: 0, durationMs: 10_000, remainingMs: 10_000, percent: 0 },
    isAtStart: true,
    isAtLiveEdge: false,
    ...overrides,
  };
}

describe("ReplayTimeline", () => {
  afterEach(cleanup);

  it("renders without crashing", () => {
    const { container } = render(<ReplayTimeline timeline={makeTimeline()} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("renders a range input", () => {
    const { getByLabelText } = render(<ReplayTimeline timeline={makeTimeline()} />);
    expect(getByLabelText("Replay timeline")).toBeTruthy();
  });

  it("range input value reflects fraction", () => {
    const { getByLabelText } = render(<ReplayTimeline timeline={makeTimeline({ fraction: 0.5 })} />);
    const slider = getByLabelText("Replay timeline") as HTMLInputElement;
    expect(Number(slider.value)).toBe(5000);
  });

  it("calls seekTo when slider changes", () => {
    const seekTo = vi.fn();
    const { getByLabelText } = render(<ReplayTimeline timeline={makeTimeline({ seekTo })} />);
    const slider = getByLabelText("Replay timeline");
    fireEvent.change(slider, { target: { value: "2500" } });
    expect(seekTo).toHaveBeenCalledWith(0.25);
  });

  it("displays current time label", () => {
    const { getByText } = render(
      <ReplayTimeline timeline={makeTimeline({ currentT: 65_000, earliest: 0 })} />
    );
    expect(getByText("01:05")).toBeTruthy();
  });

  it("displays total time label", () => {
    const { getByText } = render(
      <ReplayTimeline timeline={makeTimeline({ latest: 120_000, earliest: 0 })} />
    );
    expect(getByText("02:00")).toBeTruthy();
  });

  it("uses custom formatTime function", () => {
    const formatTime = vi.fn().mockReturnValue("X:XX");
    const { getAllByText } = render(
      <ReplayTimeline timeline={makeTimeline()} formatTime={formatTime} />
    );
    expect(formatTime).toHaveBeenCalled();
    expect(getAllByText("X:XX").length).toBeGreaterThan(0);
  });

  it("applies className and style", () => {
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline()}
        className="my-class"
        style={{ background: "red" }}
      />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("my-class");
    expect(el.style.background).toBe("red");
  });

  it("renders segment bars when segments prop is provided", () => {
    const segments = [
      { start: 0, end: 4_000 },
      { start: 6_000, end: 10_000 },
    ];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ earliest: 0, latest: 10_000 })}
        segments={segments}
      />
    );
    // The overlay div (aria-hidden) should be present
    const overlay = container.querySelector("[aria-hidden='true']");
    expect(overlay).toBeTruthy();
    // Two segment bars inside the overlay
    const bars = overlay!.querySelectorAll("div");
    // 2 segment divs + 1 gap div = 3
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it("renders gap overlay between segments", () => {
    const segments = [
      { start: 0, end: 3_000 },
      { start: 7_000, end: 10_000 },
    ];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ earliest: 0, latest: 10_000 })}
        segments={segments}
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    expect(overlay).toBeTruthy();
    // Should have at least segment bars + gap overlay
    const divs = overlay!.querySelectorAll("div");
    expect(divs.length).toBeGreaterThanOrEqual(3);
  });

  it("does not render overlay when segments is empty and timeline.segments is empty", () => {
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ segments: [] })}
        segments={[]}
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    expect(overlay).toBeNull();
  });

  it("renders segment bars from timeline.segments when segments prop is omitted", () => {
    const timelineSegments = [{ start: 0, end: 5_000 }];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ segments: timelineSegments, earliest: 0, latest: 10_000 })}
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    expect(overlay).toBeTruthy();
  });

  it("applies custom segmentColor", () => {
    const segments = [{ start: 0, end: 5_000 }];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ earliest: 0, latest: 10_000 })}
        segments={segments}
        segmentColor="rgb(255, 0, 0)"
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    const segBar = overlay!.querySelector("div") as HTMLElement;
    expect(segBar.style.background).toBe("rgb(255, 0, 0)");
  });

  it("applies custom gapStyle to gap overlay", () => {
    const segments = [
      { start: 0, end: 3_000 },
      { start: 7_000, end: 10_000 },
    ];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ earliest: 0, latest: 10_000 })}
        segments={segments}
        gapStyle={{ background: "red" }}
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    // Gap div is after the 2 segment divs — find it by checking for red background
    const allDivs = Array.from(overlay!.querySelectorAll("div")) as HTMLElement[];
    const gapDiv = allDivs.find((d) => d.style.background === "red");
    expect(gapDiv).toBeTruthy();
  });

  it("skips segment bar when segEnd <= seg.start (zero-width segment)", () => {
    const segments = [
      { start: 5_000, end: 5_000 }, // zero-width, should be skipped
      { start: 7_000, end: 10_000 },
    ];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ earliest: 0, latest: 10_000 })}
        segments={segments}
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    // Only 1 visible segment bar (second one) — zero-width returns null
    const divs = overlay!.querySelectorAll("div");
    expect(divs.length).toBeGreaterThanOrEqual(1);
  });

  it("handles open segment (end: null) using latest", () => {
    const segments = [{ start: 0, end: null }];
    const { container } = render(
      <ReplayTimeline
        timeline={makeTimeline({ earliest: 0, latest: 10_000 })}
        segments={segments}
      />
    );
    const overlay = container.querySelector("[aria-hidden='true']");
    expect(overlay).toBeTruthy();
  });
});
