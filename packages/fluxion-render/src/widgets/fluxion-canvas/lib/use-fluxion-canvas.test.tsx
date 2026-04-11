import { render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { Op } from "../../../shared/protocol";
import { useFluxionCanvas } from "./use-fluxion-canvas";

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

function Harness({
  workerFactory,
  onHost,
}: {
  workerFactory: () => Worker;
  onHost?: (host: unknown) => void;
}) {
  const { containerRef, host } = useFluxionCanvas({
    layers: [
      { id: "axis", kind: "axis-grid" },
      { id: "line", kind: "line", config: { color: "#fff" } },
    ],
    hostOptions: { workerFactory },
  });
  useEffect(() => {
    if (host && onHost) onHost(host);
  }, [host, onHost]);
  return <div ref={containerRef} style={{ width: 200, height: 100 }} />;
}

describe("useFluxionCanvas", () => {
  it("creates a host and posts INIT + 2 ADD_LAYER on mount", () => {
    const { factory, posts } = makeFakeWorkerFactory();
    render(<Harness workerFactory={factory} />);
    const ops = posts.map((p) => (p.msg as { op: number }).op);
    expect(ops).toContain(Op.INIT);
    expect(ops.filter((o) => o === Op.ADD_LAYER)).toHaveLength(2);
  });

  it("exposes the live host via useState once mounted", () => {
    const { factory } = makeFakeWorkerFactory();
    const onHost = vi.fn();
    render(<Harness workerFactory={factory} onHost={onHost} />);
    expect(onHost).toHaveBeenCalled();
    // host arg must not be null once delivered
    expect(onHost.mock.calls[0][0]).not.toBeNull();
  });

  it("terminates the worker on unmount", () => {
    const { factory, terminate } = makeFakeWorkerFactory();
    const { unmount } = render(<Harness workerFactory={factory} />);
    unmount();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("survives StrictMode double-invoke with a fresh canvas each mount", () => {
    const { factory, terminate } = makeFakeWorkerFactory();
    expect(() =>
      render(
        <StrictMode>
          <Harness workerFactory={factory} />
        </StrictMode>,
      ),
    ).not.toThrow();
    // StrictMode disposes the first host; the second (live) host is still mounted.
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
