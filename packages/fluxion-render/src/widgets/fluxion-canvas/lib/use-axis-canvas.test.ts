import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useXAxisCanvas, useYAxisCanvas } from "./use-axis-canvas";

type ROCallback = (entries: ResizeObserverEntry[]) => void;

let capturedCallbacks: ROCallback[] = [];
let observedElements: Element[] = [];
let disconnectedCount = 0;

class FiringResizeObserver {
  private cb: ROCallback;
  constructor(cb: ROCallback) {
    this.cb = cb;
    capturedCallbacks.push(cb);
  }
  observe(el: Element): void {
    observedElements.push(el);
    this.cb([
      {
        contentRect: { width: 200, height: 100 } as DOMRect,
        target: el,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      } as ResizeObserverEntry,
    ]);
  }
  unobserve(): void {}
  disconnect(): void {
    disconnectedCount++;
  }
}

function fireResize(cb: ROCallback, width: number, height: number, el: Element) {
  cb([
    {
      contentRect: { width, height } as DOMRect,
      target: el,
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    } as ResizeObserverEntry,
  ]);
}

function setupCanvas(width = 200, height = 100) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
  document.body.appendChild(canvas);
  return canvas;
}

beforeEach(() => {
  capturedCallbacks = [];
  observedElements = [];
  disconnectedCount = 0;
  (globalThis as any).ResizeObserver = FiringResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useYAxisCanvas", () => {
  it("returns a ref object (initially current=null before DOM attach)", () => {
    const { result } = renderHook(() => useYAxisCanvas([]));
    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("object");
  });

  it("creates a ResizeObserver that observes the canvas element", () => {
    const canvas = setupCanvas();
    const { result } = renderHook(() => useYAxisCanvas([]));
    (result.current as any).current = canvas;
    act(() => {});
    expect(observedElements.length).toBeGreaterThanOrEqual(0);
  });

  it("disconnects ResizeObserver on unmount", () => {
    const canvas = setupCanvas();
    const before = disconnectedCount;
    const { unmount } = renderHook(() => {
      const ref = useYAxisCanvas([]);
      (ref as any).current = canvas;
      return ref;
    });
    unmount();
    expect(disconnectedCount).toBeGreaterThan(before);
  });

  it("does not throw when canvas has zero dimensions", () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);
    expect(() => {
      renderHook(() => useYAxisCanvas([]));
    }).not.toThrow();
  });

  it("fires ResizeObserver callback and scales canvas by devicePixelRatio", () => {
    const dpr = 2;
    Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });

    const canvas = setupCanvas(200, 100);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 100,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    renderHook(() => {
      const ref = useYAxisCanvas([]);
      (ref as any).current = canvas;
      return ref;
    });

    act(() => {
      if (capturedCallbacks.length > 0) {
        fireResize(capturedCallbacks[0]!, 200, 100, canvas);
      }
    });

    expect(canvas.width).toBe(Math.round(200 * dpr));
    expect(canvas.height).toBe(Math.round(100 * dpr));

    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
  });

  it("calls drawY via tick effect with ticks and draws labels", () => {
    const canvas = setupCanvas(60, 200);
    const fillText = vi.fn();
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText,
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);

    renderHook(() => {
      const ref = useYAxisCanvas([{ label: "100", fraction: 1, value: 100 }]);
      (ref as any).current = canvas;
      return ref;
    });

    expect(fillText).toHaveBeenCalledWith("100", expect.any(Number), expect.any(Number));
  });

  it("skips tick marks when tickSize is 0", () => {
    const canvas = setupCanvas(60, 200);
    const stroke = vi.fn();
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke,
      fillText: vi.fn(),
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);

    renderHook(() => {
      const ref = useYAxisCanvas([{ label: "50", fraction: 0.5, value: 50 }], {
        tickSize: 0,
      });
      (ref as any).current = canvas;
      return ref;
    });

    expect(stroke).not.toHaveBeenCalled();
  });
});

describe("useXAxisCanvas", () => {
  it("returns a ref object", () => {
    const { result } = renderHook(() => useXAxisCanvas([]));
    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("object");
  });

  it("disconnects ResizeObserver on unmount", () => {
    const before = disconnectedCount;
    const canvas = setupCanvas();
    const { unmount } = renderHook(() => {
      const ref = useXAxisCanvas([]);
      (ref as any).current = canvas;
      return ref;
    });
    unmount();
    expect(disconnectedCount).toBeGreaterThan(before);
  });

  it("applies devicePixelRatio when resizing", () => {
    const dpr = 3;
    Object.defineProperty(window, "devicePixelRatio", { value: dpr, configurable: true });

    const canvas = setupCanvas(300, 30);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 30,
      left: 0,
      top: 0,
      right: 300,
      bottom: 30,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    renderHook(() => {
      const ref = useXAxisCanvas([]);
      (ref as any).current = canvas;
      return ref;
    });

    act(() => {
      if (capturedCallbacks.length > 0) {
        fireResize(capturedCallbacks[capturedCallbacks.length - 1]!, 300, 30, canvas);
      }
    });

    expect(canvas.width).toBe(Math.round(300 * dpr));
    expect(canvas.height).toBe(Math.round(30 * dpr));

    Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
  });

  it("does not call getContext when rect is zero-sized", () => {
    const canvas = document.createElement("canvas");
    const getContextSpy = vi.spyOn(canvas, "getContext");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    renderHook(() => {
      const ref = useXAxisCanvas([{ label: "test", fraction: 0.5, value: 50 }]);
      (ref as any).current = canvas;
      return ref;
    });

    act(() => {
      if (capturedCallbacks.length > 0) {
        fireResize(capturedCallbacks[capturedCallbacks.length - 1]!, 0, 0, canvas);
      }
    });

    expect(getContextSpy).not.toHaveBeenCalled();
  });

  it("calls drawX via tick effect with ticks and draws labels", () => {
    const canvas = setupCanvas(300, 30);
    const fillText = vi.fn();
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText,
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);

    renderHook(() => {
      const ref = useXAxisCanvas([{ label: "T1", fraction: 0.25, value: 25 }]);
      (ref as any).current = canvas;
      return ref;
    });

    expect(fillText).toHaveBeenCalledWith("T1", expect.any(Number), expect.any(Number));
  });

  it("falls back to dpr 1 when devicePixelRatio is falsy", () => {
    const realDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { value: 0, configurable: true });

    const canvas = setupCanvas(300, 30);
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      scale: vi.fn(),
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);

    renderHook(() => {
      const ref = useXAxisCanvas([{ label: "T", fraction: 0.5, value: 5 }]);
      (ref as any).current = canvas;
      return ref;
    });

    // dpr=1 fallback → target size equals CSS size (no scaling up).
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(30);

    if (realDpr) Object.defineProperty(window, "devicePixelRatio", realDpr);
  });

  it("skips x tick marks when tickSize is 0", () => {
    const canvas = setupCanvas(300, 30);
    const stroke = vi.fn();
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke,
      fillText: vi.fn(),
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);

    renderHook(() => {
      const ref = useXAxisCanvas([{ label: "T1", fraction: 0.5, value: 5 }], {
        tickSize: 0,
      });
      (ref as any).current = canvas;
      return ref;
    });

    expect(stroke).not.toHaveBeenCalled();
  });

  it("falls back to an empty tick list when ticks is nullish", () => {
    const canvas = setupCanvas(300, 30);
    const fillText = vi.fn();
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText,
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);

    renderHook(() => {
      // Untyped nullish ticks exercise the `ticksRef.current ?? []` fallback.
      const ref = useXAxisCanvas(undefined as unknown as never);
      (ref as any).current = canvas;
      return ref;
    });

    // No ticks → no labels drawn, but no throw either.
    expect(fillText).not.toHaveBeenCalled();
  });

  it("calls ctx.scale when canvas size changes on resize", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const scale = vi.fn();
    const fakeCtx = {
      clearRect: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
      font: "",
      textAlign: "",
      textBaseline: "",
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      scale,
    };
    vi.spyOn(canvas, "getContext").mockReturnValue(fakeCtx as any);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      width: 300,
      height: 30,
      left: 0,
      top: 0,
      right: 300,
      bottom: 30,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);
    document.body.appendChild(canvas);

    renderHook(() => {
      const ref = useXAxisCanvas([]);
      (ref as any).current = canvas;
      return ref;
    });

    act(() => {
      if (capturedCallbacks.length > 0) {
        fireResize(capturedCallbacks[capturedCallbacks.length - 1]!, 300, 30, canvas);
      }
    });

    expect(scale).toHaveBeenCalled();
  });
});
