import { act, render, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../host";
import type { UseFluxionBrushOptions } from "./use-fluxion-brush";
import { useFluxionBrush } from "./use-fluxion-brush";

function makeMockHost() {
  let tickCb: ((xTicks: { value: number; fraction: number }[]) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    tickCb = null;
  });
  const onTickUpdate = vi.fn((listener: any) => {
    tickCb = listener;
    return unsubscribe;
  });
  const fireTickUpdate = (ticks: { value: number; fraction: number }[]) =>
    tickCb?.(ticks as any);
  return {
    host: { onTickUpdate } as unknown as FluxionHost,
    fireTickUpdate,
    unsubscribe,
  };
}

let capturedResult: ReturnType<typeof useFluxionBrush> | null = null;

function BrushHarness(props: UseFluxionBrushOptions & { width?: number; left?: number }) {
  const { width = 400, left = 0, ...hookOpts } = props;
  const result = useFluxionBrush(hookOpts);
  capturedResult = result;
  return React.createElement("svg", {
    ref: result.brushRef,
    style: { width, height: 100 },
    "data-testid": "brush-svg",
  });
}

function renderBrush(
  opts: UseFluxionBrushOptions & { width?: number; left?: number } = { host: null },
) {
  capturedResult = null;
  const { container, unmount, rerender } = render(
    React.createElement(BrushHarness, opts),
  );
  const svg = container.querySelector("svg") as SVGSVGElement;
  const w = opts.width ?? 400;
  const l = opts.left ?? 0;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    width: w,
    height: 100,
    left: l,
    top: 0,
    right: l + w,
    bottom: 100,
    x: l,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
  return {
    svg,
    unmount,
    rerender: (newProps: any) => rerender(React.createElement(BrushHarness, newProps)),
  };
}

function fireMouseDown(svg: SVGSVGElement, clientX: number) {
  act(() => {
    svg.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX }),
    );
  });
}

function fireMouseUp(clientX: number) {
  act(() => {
    window.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX }),
    );
  });
}

beforeEach(() => {
  capturedResult = null;
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useFluxionBrush — initial state", () => {
  it("returns selection=null initially", () => {
    renderBrush({ host: null });
    expect(capturedResult!.selection).toBeNull();
  });

  it("returns brushRef, selection, and clearSelection", () => {
    renderBrush({ host: null });
    expect(capturedResult!.brushRef).toBeDefined();
    expect(capturedResult!.selection).toBeNull();
    expect(typeof capturedResult!.clearSelection).toBe("function");
  });

  it("mounts without throwing when host is null", () => {
    expect(() => renderBrush({ host: null })).not.toThrow();
  });
});

describe("useFluxionBrush — clearSelection", () => {
  it("clearSelection is a no-op when selection is already null", () => {
    renderBrush({ host: null });
    act(() => {
      capturedResult!.clearSelection();
    });
    expect(capturedResult!.selection).toBeNull();
  });

  it("clearSelection resets selection to null after a drag", () => {
    const { svg } = renderBrush({ host: null });

    fireMouseDown(svg, 50);
    fireMouseUp(250);

    expect(capturedResult!.selection).not.toBeNull();

    act(() => {
      capturedResult!.clearSelection();
    });

    expect(capturedResult!.selection).toBeNull();
  });
});

describe("useFluxionBrush — drag selection", () => {
  it("sets selection after a wide drag (>= 4px)", () => {
    const { svg } = renderBrush({ host: null });

    fireMouseDown(svg, 100);
    fireMouseUp(200);

    expect(capturedResult!.selection).not.toBeNull();
  });

  it("selection is null when drag is too small (< 4px)", () => {
    const { svg } = renderBrush({ host: null });

    fireMouseDown(svg, 100);
    fireMouseUp(102);

    expect(capturedResult!.selection).toBeNull();
  });

  it("selection has tStart <= tEnd regardless of drag direction (right-to-left)", () => {
    const { host, fireTickUpdate } = makeMockHost();
    const { svg } = renderBrush({ host });

    act(() => {
      fireTickUpdate([
        { value: 0, fraction: 0 },
        { value: 1000, fraction: 1 },
      ] as any);
    });

    fireMouseDown(svg, 300);
    fireMouseUp(100);

    const sel = capturedResult!.selection;
    expect(sel).not.toBeNull();
    if (sel) {
      expect(sel.tStart).toBeLessThanOrEqual(sel.tEnd);
    }
  });

  it("calls onSelect callback with selection when drag completes", () => {
    const onSelect = vi.fn();
    const { svg } = renderBrush({ host: null, onSelect });

    fireMouseDown(svg, 50);
    fireMouseUp(250);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const called = onSelect.mock.calls[0]![0];
    expect(called).toHaveProperty("tStart");
    expect(called).toHaveProperty("tEnd");
  });

  it("does not call onSelect for small drag (< 4px)", () => {
    const onSelect = vi.fn();
    const { svg } = renderBrush({ host: null, onSelect });

    fireMouseDown(svg, 100);
    fireMouseUp(101);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selection accounts for left offset of svg element", () => {
    const { svg } = renderBrush({ host: null, width: 400, left: 100 });

    fireMouseDown(svg, 150);
    fireMouseUp(350);

    expect(capturedResult!.selection).not.toBeNull();
  });
});

describe("useFluxionBrush — host integration", () => {
  it("subscribes to onTickUpdate when host is provided", () => {
    const { host } = makeMockHost();
    renderBrush({ host });
    expect(host.onTickUpdate).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from onTickUpdate on unmount", () => {
    const { host, unsubscribe } = makeMockHost();
    const { unmount } = renderBrush({ host });
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not call onTickUpdate when host is null", () => {
    const { host } = makeMockHost();
    renderBrush({ host: null });
    expect(host.onTickUpdate).not.toHaveBeenCalled();
  });

  it("uses tick fractions for pixel-to-time interpolation after tick update", () => {
    const { host, fireTickUpdate } = makeMockHost();
    const { svg } = renderBrush({ host, width: 400 });

    act(() => {
      fireTickUpdate([
        { value: 0, fraction: 0 },
        { value: 1000, fraction: 1 },
      ] as any);
    });

    fireMouseDown(svg, 0);
    fireMouseUp(400);

    const sel = capturedResult!.selection;
    expect(sel).not.toBeNull();
    if (sel) {
      expect(sel.tStart).toBeLessThan(sel.tEnd);
    }
  });
});

describe("useFluxionBrush — pxToTime edge extrapolation", () => {
  it("extrapolates below the first tick and above the last tick", () => {
    const { host, fireTickUpdate } = makeMockHost();
    const onSelect = vi.fn();
    const { svg } = renderBrush({ host, width: 400, onSelect });

    // Ticks span only the middle [0.25, 0.75] of the axis, so drags to the
    // far edges fall OUTSIDE every bracket → hits both extrapolation branches.
    act(() => {
      fireTickUpdate([
        { value: 250, fraction: 0.25 },
        { value: 750, fraction: 0.75 },
      ] as any);
    });

    fireMouseDown(svg, 0); // fraction 0 < 0.25 → low-edge extrapolation
    fireMouseUp(400); // fraction 1 > 0.75 → high-edge extrapolation

    const sel = capturedResult!.selection;
    expect(sel).not.toBeNull();
    if (sel) {
      // Extrapolated below 250 and above 750.
      expect(sel.tStart).toBeLessThan(250);
      expect(sel.tEnd).toBeGreaterThan(750);
    }
  });
});

describe("useFluxionBrush — mousemove guard", () => {
  it("a mousemove without an active drag is a no-op (no selection)", () => {
    renderBrush({ host: null });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 123 }));
    });
    expect(capturedResult!.selection).toBeNull();
  });

  it("a mouseup without an active drag is a no-op", () => {
    renderBrush({ host: null });
    fireMouseUp(200); // no preceding mousedown
    expect(capturedResult!.selection).toBeNull();
  });
});

describe("useFluxionBrush — renderHook API", () => {
  it("returns a brushRef object from renderHook", () => {
    const { result } = renderHook(() => useFluxionBrush({ host: null }));
    expect(result.current.brushRef).toBeDefined();
    expect(typeof result.current.clearSelection).toBe("function");
    expect(result.current.selection).toBeNull();
  });

  it("subscribes to host.onTickUpdate via renderHook", () => {
    const { host } = makeMockHost();
    const { unmount } = renderHook(() => useFluxionBrush({ host }));
    expect(host.onTickUpdate).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("useFluxionBrush — cleanup", () => {
  it("unmounts without throwing", () => {
    const { unmount } = renderBrush({ host: null });
    expect(() => unmount()).not.toThrow();
  });
});
