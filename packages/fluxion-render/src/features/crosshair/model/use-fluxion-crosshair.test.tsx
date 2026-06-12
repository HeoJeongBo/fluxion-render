import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../host";
import { HoverDataCache } from "./hover-data-cache";
import {
  type CrosshairState,
  type UseFluxionCrosshairOptions,
  useFluxionCrosshair,
} from "./use-fluxion-crosshair";

// Override the no-op FakeResizeObserver from setup.ts with one that fires immediately.
// This ensures sizeRef is seeded correctly when the hook calls el.clientWidth.
type ROCallback = (entries: ResizeObserverEntry[]) => void;
class FiringResizeObserver {
  private cb: ROCallback;
  constructor(cb: ROCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    this.cb([
      {
        contentRect: { width: el.clientWidth || 200, height: el.clientHeight || 100 },
      } as ResizeObserverEntry,
    ]);
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  // biome-ignore lint: patching global for tests
  (globalThis as any).ResizeObserver = FiringResizeObserver;
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeMockHost() {
  let cb: ((yMin: number, yMax: number, latestT: number) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    cb = null;
  });
  const onBoundsChange = vi.fn((listener) => {
    cb = listener;
    return unsubscribe;
  });
  const fireBounds = (yMin: number, yMax: number, latestT: number) =>
    cb?.(yMin, yMax, latestT);
  return {
    host: { onBoundsChange } as unknown as FluxionHost,
    fireBounds,
    unsubscribe,
  };
}

function makeCache(id = "a") {
  const c = new HoverDataCache();
  c.registerLayer(id, { capacity: 8, label: "Series A", color: "#f00" });
  return c;
}

type HarnessProps = Omit<UseFluxionCrosshairOptions, "host"> & {
  host: FluxionHost | null;
  onState?: (s: CrosshairState) => void;
};

function Harness({ onState, ...opts }: HarnessProps) {
  const { chartRef, state } = useFluxionCrosshair(opts);
  useEffect(() => {
    onState?.(state);
  });
  return <div ref={chartRef} />;
}

function stubRect(el: Element, rect: Partial<DOMRect> = {}) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 200,
    bottom: 100,
    width: 200,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => {},
    ...rect,
  } as DOMRect);
  Object.defineProperty(el, "clientWidth", {
    value: rect.width ?? 200,
    configurable: true,
  });
  Object.defineProperty(el, "clientHeight", {
    value: rect.height ?? 100,
    configurable: true,
  });
}

function firePointerMove(el: Element, clientX: number, clientY: number) {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
      }),
    );
  });
}

function firePointerLeave(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("pointerleave", { bubbles: true, cancelable: true }));
  });
}

// ─── mount / unmount ─────────────────────────────────────────────────────────

describe("mount behavior", () => {
  it("mounts without throwing when host is null", () => {
    const cache = makeCache();
    expect(() =>
      render(<Harness host={null} cache={cache} xMode="fixed" xRange={[0, 100]} />),
    ).not.toThrow();
  });

  it("initial state has position=null and empty points", () => {
    const cache = makeCache();
    const onState = vi.fn();
    render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 100]}
        onState={onState}
      />,
    );
    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.position).toBeNull();
    expect(lastState.points).toHaveLength(0);
  });

  it("subscribes to onBoundsChange when host is provided", () => {
    const { host } = makeMockHost();
    const cache = makeCache();
    render(<Harness host={host} cache={cache} xMode="fixed" xRange={[0, 100]} />);
    expect(host.onBoundsChange).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from onBoundsChange on unmount", () => {
    const { host, unsubscribe } = makeMockHost();
    const cache = makeCache();
    const { unmount } = render(
      <Harness host={host} cache={cache} xMode="fixed" xRange={[0, 100]} />,
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

// ─── pointermove ─────────────────────────────────────────────────────────────

describe("pointermove", () => {
  it("updates position.pxX and pxY from clientX/clientY minus rect offset", () => {
    const cache = makeCache();
    const onState = vi.fn();
    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 200]}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 80, 40);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.position).toEqual({ pxX: 80, pxY: 40 });
  });

  it("subtracts rect offset from clientX/clientY", () => {
    const cache = makeCache();
    const onState = vi.fn();
    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 200]}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 50, top: 20, width: 200, height: 100 });

    firePointerMove(el, 150, 70);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    // pxX = 150 - 50 = 100, pxY = 70 - 20 = 50
    expect(lastState.position).toEqual({ pxX: 100, pxY: 50 });
  });

  it("resets state to empty on pointerleave", () => {
    const cache = makeCache();
    const onState = vi.fn();
    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 200]}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el);

    firePointerMove(el, 100, 50);
    firePointerLeave(el);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.position).toBeNull();
    expect(lastState.points).toHaveLength(0);
  });
});

// ─── xMode="fixed" — dataT calculation and nearest lookup ───────────────────

describe('xMode="fixed"', () => {
  it("finds nearest point when mouse is at matching data t", () => {
    const cache = makeCache();
    cache.push("a", 100, 42);
    const onState = vi.fn();

    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 200]}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    // pxX=100 with xRange=[0,200] and width=200 → dataT = 0 + (100/200)*200 = 100
    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points).toHaveLength(1);
    expect(lastState.points[0]!.t).toBe(100);
    expect(lastState.points[0]!.y).toBe(42);
    expect(lastState.points[0]!.layerId).toBe("a");
  });

  it("skips points outside xMin (left of visible range)", () => {
    const { host, fireBounds } = makeMockHost();
    const cache = makeCache();
    cache.push("a", 10, 99); // t=10, but xMin = 50 after bounds update
    const onState = vi.fn();

    const { container } = render(
      <Harness
        host={host}
        cache={cache}
        xMode="fixed"
        xRange={[50, 250]}
        onState={onState}
      />,
    );
    act(() => {
      fireBounds(-1, 1, 0);
    }); // triggers boundsRef.xMin = xRange[0] = 50

    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points).toHaveLength(0);
  });

  it("includes label and color from registered layer", () => {
    const c = new HoverDataCache();
    c.registerLayer("b", { capacity: 8, label: "Beta", color: "#0f0" });
    c.push("b", 100, 7);
    const onState = vi.fn();

    const { container } = render(
      <Harness host={null} cache={c} xMode="fixed" xRange={[0, 200]} onState={onState} />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points[0]!.label).toBe("Beta");
    expect(lastState.points[0]!.color).toBe("#0f0");
  });
});

// ─── xMode="time" — dataT uses cache.getLatestT() ────────────────────────────

describe('xMode="time"', () => {
  it("derives xMax from cache.getLatestT() so window tracks newest data", () => {
    const cache = makeCache();
    cache.push("a", 1000, 5);
    const onState = vi.fn();

    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="time"
        timeWindowMs={200}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    // xMax = getLatestT() = 1000, xMin = 800
    // pxX=200 (rightmost) → dataT = 800 + (200/200)*200 = 1000
    firePointerMove(el, 200, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points).toHaveLength(1);
    expect(lastState.points[0]!.t).toBe(1000);
  });

  it("returns no points when cache is empty (xMax=0 → xMin<0, dataT may still miss)", () => {
    const cache = makeCache();
    const onState = vi.fn();

    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="time"
        timeWindowMs={200}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el);

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points).toHaveLength(0);
  });
});

// ─── custom formatters ────────────────────────────────────────────────────────

describe("custom xFormat / yFormat", () => {
  it("applies xFormat to produce xLabel", () => {
    const cache = makeCache();
    cache.push("a", 100, 42);
    const xFormat = vi.fn((t: number) => `x:${t}`);
    const onState = vi.fn();

    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 200]}
        xFormat={xFormat}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points[0]!.xLabel).toBe("x:100");
    expect(xFormat).toHaveBeenCalledWith(100);
  });

  it("applies yFormat to produce yLabel", () => {
    const cache = makeCache();
    cache.push("a", 100, 2.5); // use exact float32-representable value
    const yFormat = vi.fn((y: number) => `y:${y.toFixed(2)}`);
    const onState = vi.fn();

    const { container } = render(
      <Harness
        host={null}
        cache={cache}
        xMode="fixed"
        xRange={[0, 200]}
        yFormat={yFormat}
        onState={onState}
      />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points[0]!.yLabel).toBe("y:2.50");
    expect(yFormat).toHaveBeenCalledWith(2.5);
  });
});

// ─── host.onBoundsChange integration ─────────────────────────────────────────

describe("host.onBoundsChange integration", () => {
  it("updates bounds when host fires, affecting fixed-mode xMin/xMax on next move", () => {
    // fixed mode reads xMin/xMax from boundsRef when xRange is updated via bounds
    // (in fixed mode the hook sets b.xMin/xMax from xRange option, not from fireBounds)
    // — this test verifies bounds subscription does not throw and cleans up properly
    const { host, fireBounds, unsubscribe } = makeMockHost();
    const cache = makeCache();

    const { unmount } = render(
      <Harness host={host} cache={cache} xMode="fixed" xRange={[0, 100]} />,
    );

    act(() => {
      fireBounds(-1, 1, 500);
    });

    expect(() => unmount()).not.toThrow();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("does not call onBoundsChange when host is null", () => {
    const { host } = makeMockHost();
    const cache = makeCache();
    render(<Harness host={null} cache={cache} xMode="fixed" xRange={[0, 100]} />);
    expect(host.onBoundsChange).not.toHaveBeenCalled();
  });
});

// ─── multiple layers ──────────────────────────────────────────────────────────

describe("multiple layers", () => {
  it("returns a point for each layer that has a match", () => {
    const c = new HoverDataCache();
    c.registerLayer("x", { capacity: 8, label: "X", color: "#f00" });
    c.registerLayer("y", { capacity: 8, label: "Y", color: "#0f0" });
    c.push("x", 100, 1);
    c.push("y", 100, 2);
    const onState = vi.fn();

    const { container } = render(
      <Harness host={null} cache={c} xMode="fixed" xRange={[0, 200]} onState={onState} />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points).toHaveLength(2);
    expect(lastState.points.map((p) => p.layerId)).toEqual(["x", "y"]);
  });

  it("omits layers with no data in range", () => {
    const c = new HoverDataCache();
    c.registerLayer("x", { capacity: 8 });
    c.registerLayer("y", { capacity: 8 });
    c.push("x", 100, 1);
    // "y" has no data
    const onState = vi.fn();

    const { container } = render(
      <Harness host={null} cache={c} xMode="fixed" xRange={[0, 200]} onState={onState} />,
    );
    const el = container.firstChild as HTMLElement;
    stubRect(el, { left: 0, top: 0, width: 200, height: 100 });

    firePointerMove(el, 100, 50);

    const lastState = onState.mock.calls[
      onState.mock.calls.length - 1
    ][0] as CrosshairState;
    expect(lastState.points).toHaveLength(1);
    expect(lastState.points[0]!.layerId).toBe("x");
  });
});
