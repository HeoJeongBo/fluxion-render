import { render } from "@testing-library/react";
import { StrictMode, createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Op } from "../../../shared/protocol";
import { FluxionCanvas, type FluxionCanvasHandle } from "./fluxion-canvas";

interface RecordedPost {
  msg: unknown;
  transfer?: Transferable[];
}

function makeFakeWorkerFactory() {
  const posts: RecordedPost[] = [];
  const terminate = vi.fn();
  const factory = () =>
    ({
      postMessage: (msg: unknown, transfer?: Transferable[]) => {
        posts.push({ msg, transfer });
      },
      terminate,
      onmessage: null,
      onerror: null,
    }) as unknown as Worker;
  return { factory, posts, terminate };
}

describe("FluxionCanvas", () => {
  it("mounts, creates a host, and forwards the initial layer list", () => {
    const { factory, posts } = makeFakeWorkerFactory();
    const handleRef = createRef<FluxionCanvasHandle>();
    render(
      <FluxionCanvas
        ref={handleRef}
        hostOptions={{ workerFactory: factory }}
        layers={[
          { id: "axis", kind: "axis-grid", config: { xRange: [0, 1] } },
          { id: "line", kind: "line", config: { color: "#0ff" } },
        ]}
      />,
    );
    // Messages: INIT + 2× ADD_LAYER
    const ops = posts.map((p) => (p.msg as { op: number }).op);
    expect(ops).toContain(Op.INIT);
    expect(ops.filter((o) => o === Op.ADD_LAYER)).toHaveLength(2);
    expect(handleRef.current?.getHost()).not.toBeNull();
  });

  it("terminates the worker on unmount", () => {
    const { factory, terminate } = makeFakeWorkerFactory();
    const { unmount } = render(
      <FluxionCanvas
        hostOptions={{ workerFactory: factory }}
        layers={[{ id: "axis", kind: "axis-grid" }]}
      />,
    );
    unmount();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("survives React StrictMode double-invoke (fresh canvas per mount)", () => {
    // Regression: transferControlToOffscreen is one-shot per canvas.
    // StrictMode mounts -> unmounts -> remounts the same component in dev,
    // so the widget must allocate a fresh <canvas> on each mount.
    const { factory, terminate } = makeFakeWorkerFactory();
    expect(() =>
      render(
        <StrictMode>
          <FluxionCanvas
            hostOptions={{ workerFactory: factory }}
            layers={[{ id: "axis", kind: "axis-grid" }]}
          />
        </StrictMode>,
      ),
    ).not.toThrow();
    // First host was disposed on StrictMode cleanup, second is live.
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("calls onReady with the host after mount", () => {
    const { factory } = makeFakeWorkerFactory();
    const onReady = vi.fn();
    render(
      <FluxionCanvas
        hostOptions={{ workerFactory: factory }}
        layers={[]}
        onReady={onReady}
      />,
    );
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
