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
});
