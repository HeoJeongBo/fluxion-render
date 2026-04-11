import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useResizeObserver, type ResizeInfo } from "./use-resize-observer";

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
});
