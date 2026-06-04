import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaybackControls } from "./playback-controls";

function make(overrides: Partial<Parameters<typeof PlaybackControls>[0]> = {}) {
  const defaults = {
    isPlaying: false,
    rate: 1,
    onPlayPause: vi.fn(),
    onRateChange: vi.fn(),
    onExit: vi.fn(),
  };
  return { ...defaults, ...overrides };
}

describe("PlaybackControls", () => {
  it("renders a Play button when not playing", () => {
    const props = make({ isPlaying: false });
    render(<PlaybackControls {...props} />);
    expect(screen.getByRole("button", { name: /▶ Play/i })).toBeDefined();
  });

  it("renders a Pause button when playing", () => {
    const props = make({ isPlaying: true });
    render(<PlaybackControls {...props} />);
    expect(screen.getByRole("button", { name: /⏸ Pause/i })).toBeDefined();
  });

  it("calls onPlayPause when play/pause button is clicked", () => {
    const props = make();
    const { container } = render(<PlaybackControls {...props} />);
    const buttons = container.querySelectorAll("button");
    // First button is always play/pause
    fireEvent.click(buttons[0]!);
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it("renders default rate buttons [0.5, 1, 2, 4]", () => {
    const props = make();
    const { container } = render(<PlaybackControls {...props} />);
    const buttons = Array.from(container.querySelectorAll("button"));
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toContain("0.5×");
    expect(labels).toContain("1×");
    expect(labels).toContain("2×");
    expect(labels).toContain("4×");
  });

  it("calls onRateChange with the correct rate when a rate button is clicked", () => {
    const props = make();
    const { container } = render(<PlaybackControls {...props} />);
    const rateButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.includes("×"),
    );
    const twoX = rateButtons.find((b) => b.textContent === "2×")!;
    fireEvent.click(twoX);
    expect(props.onRateChange).toHaveBeenCalledWith(2);
  });

  it("renders custom rates", () => {
    const props = make({ rates: [1, 2, 8] });
    const { container } = render(<PlaybackControls {...props} />);
    const labels = Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels).toContain("8×");
    expect(labels).not.toContain("0.5×");
  });

  it("calls onExit when the exit button is clicked", () => {
    const props = make();
    const { container } = render(<PlaybackControls {...props} />);
    const buttons = Array.from(container.querySelectorAll("button"));
    // Last button is always exit
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });

  it("renders a custom exit label", () => {
    const props = make({ exitLabel: "Exit DVR" });
    const { container } = render(<PlaybackControls {...props} />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons[buttons.length - 1]!.textContent).toContain("Exit DVR");
  });

  it("accepts custom styles without crashing", () => {
    const props = make({
      activeStyle: { background: "red" },
      inactiveStyle: { background: "blue" },
      dangerStyle: { background: "orange" },
    });
    expect(() => render(<PlaybackControls {...props} />)).not.toThrow();
  });
});
