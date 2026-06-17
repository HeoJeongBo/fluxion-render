import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { CrosshairState } from "../model/use-fluxion-crosshair";
import { FluxionCrosshairOverlay } from "./fluxion-crosshair-overlay";

afterEach(cleanup);

const HIDDEN: CrosshairState = { position: null, points: [] };
const VISIBLE: CrosshairState = {
  position: { pxX: 100, pxY: 50 },
  points: [
    {
      layerId: "a",
      label: "A",
      color: "#f00",
      t: 1,
      y: 2,
      xLabel: "t=1",
      yLabel: "2",
    },
  ],
};

describe("FluxionCrosshairOverlay", () => {
  it("attaches the chartRef to the capture div", () => {
    const ref = createRef<HTMLDivElement>();
    render(<FluxionCrosshairOverlay chartRef={ref} state={HIDDEN} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("renders capture div + crosshair layer with default full inset", () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <FluxionCrosshairOverlay chartRef={ref} state={HIDDEN} />,
    );
    const divs = container.querySelectorAll("div");
    // capture div + crosshair root (at least 2 positioned layers)
    expect(divs.length).toBeGreaterThanOrEqual(2);
    const capture = ref.current!;
    expect(capture.style.position).toBe("absolute");
    expect(capture.style.top).toBe("0px");
    expect(capture.style.cursor).toBe("default");
  });

  it("shows a crosshair cursor on the capture div when a position is set", () => {
    const ref = createRef<HTMLDivElement>();
    render(<FluxionCrosshairOverlay chartRef={ref} state={VISIBLE} />);
    expect(ref.current!.style.cursor).toBe("crosshair");
  });

  it("applies a custom inset to both layers", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <FluxionCrosshairOverlay
        chartRef={ref}
        state={HIDDEN}
        inset={{ top: 4, left: 56, right: 8, bottom: 28 }}
      />,
    );
    const capture = ref.current!;
    expect(capture.style.left).toBe("56px");
    expect(capture.style.bottom).toBe("28px");
  });

  it("passes class names through to capture and crosshair layers", () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <FluxionCrosshairOverlay
        chartRef={ref}
        state={HIDDEN}
        captureClassName="cap"
        className="cross"
      />,
    );
    expect(container.querySelector(".cap")).toBeTruthy();
    expect(container.querySelector(".cross")).toBeTruthy();
  });
});
