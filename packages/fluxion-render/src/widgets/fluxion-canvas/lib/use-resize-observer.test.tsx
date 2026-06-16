import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ResizeInfo, useResizeObserver } from "./use-resize-observer";

function Harness({ onResize }: { onResize: (info: ResizeInfo) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useResizeObserver(ref, onResize);
  return <div ref={ref} style={{ width: 400, height: 300 }} />;
}

describe("useResizeObserver", () => {
  it("fires on mount with the element's bounding rect and current dpr", () => {
    const onResize = vi.fn();
    render(<Harness onResize={onResize} />);
    expect(onResize).toHaveBeenCalled();
    const info = onResize.mock.calls[0][0] as ResizeInfo;
    expect(typeof info.width).toBe("number");
    expect(typeof info.height).toBe("number");
    expect(info.dpr).toBeGreaterThan(0);
  });

  it("does not throw when the element is detached on unmount", () => {
    const onResize = vi.fn();
    const { unmount } = render(<Harness onResize={onResize} />);
    expect(() => unmount()).not.toThrow();
  });

  it("does nothing when the ref is never attached to an element", () => {
    const onResize = vi.fn();
    function NoRefHarness() {
      // ref.current stays null — the `if (!el) return` guard bails immediately.
      const ref = useRef<HTMLDivElement | null>(null);
      useResizeObserver(ref, onResize);
      return <div />;
    }
    render(<NoRefHarness />);
    expect(onResize).not.toHaveBeenCalled();
  });

  describe("debounced resize + dpr re-subscribe", () => {
    let roCb: (() => void) | null;
    let mqlChange: (() => void) | null;
    let removeChangeSpy: ReturnType<typeof vi.fn>;
    const realRO = globalThis.ResizeObserver;
    const realMatchMedia = window.matchMedia;

    beforeEach(() => {
      vi.useFakeTimers();
      roCb = null;
      mqlChange = null;
      removeChangeSpy = vi.fn();
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        constructor(cb: () => void) {
          roCb = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        addEventListener: (_t: string, cb: () => void) => {
          mqlChange = cb;
        },
        removeEventListener: removeChangeSpy,
      })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      vi.useRealTimers();
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = realRO;
      window.matchMedia = realMatchMedia;
    });

    function DebouncedHarness({ onResize }: { onResize: (i: ResizeInfo) => void }) {
      const ref = useRef<HTMLDivElement | null>(null);
      useResizeObserver(ref, onResize, { debounceMs: 100 });
      return <div ref={ref} style={{ width: 400, height: 300 }} />;
    }

    it("debounces ResizeObserver callbacks and re-subscribes dpr on change", () => {
      const onResize = vi.fn();
      render(<DebouncedHarness onResize={onResize} />);

      // Initial fire is immediate (not debounced).
      expect(onResize).toHaveBeenCalledTimes(1);
      expect(roCb).toBeTypeOf("function");
      expect(mqlChange).toBeTypeOf("function");

      // A burst of RO callbacks collapses into ONE debounced fire.
      onResize.mockClear();
      roCb!();
      roCb!();
      expect(onResize).not.toHaveBeenCalled(); // still pending
      vi.advanceTimersByTime(100);
      expect(onResize).toHaveBeenCalledTimes(1);

      // A dpr change fires (debounced) AND re-subscribes the media query.
      onResize.mockClear();
      mqlChange!();
      expect(removeChangeSpy).toHaveBeenCalled(); // old listener removed on re-subscribe
      vi.advanceTimersByTime(100);
      expect(onResize).toHaveBeenCalledTimes(1);
    });

    function ZeroDebounceHarness({ onResize }: { onResize: (i: ResizeInfo) => void }) {
      const ref = useRef<HTMLDivElement | null>(null);
      useResizeObserver(ref, onResize, { debounceMs: 0 });
      return <div ref={ref} style={{ width: 400, height: 300 }} />;
    }

    it("fires immediately when debounceMs is 0 and falls back to dpr 1", () => {
      // devicePixelRatio falsy → the `|| 1` fallback supplies dpr: 1.
      const realDpr = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
      Object.defineProperty(window, "devicePixelRatio", {
        value: 0,
        configurable: true,
      });

      const onResize = vi.fn();
      const { unmount } = render(<ZeroDebounceHarness onResize={onResize} />);

      // No debounce: the initial fire and each RO callback fire synchronously.
      expect(onResize).toHaveBeenCalledTimes(1);
      expect((onResize.mock.calls[0][0] as ResizeInfo).dpr).toBe(1);
      roCb!();
      expect(onResize).toHaveBeenCalledTimes(2);

      // After unmount the `cancelled` guard makes a late callback a no-op.
      unmount();
      onResize.mockClear();
      roCb!();
      expect(onResize).not.toHaveBeenCalled();

      if (realDpr) Object.defineProperty(window, "devicePixelRatio", realDpr);
    });
  });
});
