import { render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { Op } from "../../../shared/protocol";
import { type FluxionLayerSpec, useFluxionCanvas } from "./use-fluxion-canvas";

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

  describe("layer-config reconciliation", () => {
    function ConfigHarness({
      workerFactory,
      layers,
    }: {
      workerFactory: () => Worker;
      layers: FluxionLayerSpec[];
    }) {
      const { containerRef } = useFluxionCanvas({
        layers,
        hostOptions: { workerFactory },
      });
      return <div ref={containerRef} style={{ width: 200, height: 100 }} />;
    }

    const configPosts = (posts: RecordedPost[]) =>
      posts.filter((p) => (p.msg as { op: number }).op === Op.CONFIG);

    it("mount does not re-send configs already applied via addLayer", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      render(
        <ConfigHarness
          workerFactory={factory}
          layers={[
            { id: "axis", kind: "axis-grid" },
            { id: "line", kind: "line", config: { color: "#fff" } },
          ]}
        />,
      );
      expect(configPosts(posts)).toHaveLength(0);
    });

    it("changing a layer's config in a new layers array posts CONFIG for only that layer", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const { rerender } = render(
        <ConfigHarness
          workerFactory={factory}
          layers={[
            { id: "axis", kind: "axis-grid", config: { xMode: "fixed" } },
            { id: "line", kind: "line", config: { color: "#fff" } },
          ]}
        />,
      );
      rerender(
        <ConfigHarness
          workerFactory={factory}
          layers={[
            { id: "axis", kind: "axis-grid", config: { xMode: "fixed" } },
            { id: "line", kind: "line", config: { color: "#f00" } },
          ]}
        />,
      );
      const configs = configPosts(posts);
      expect(configs).toHaveLength(1);
      expect(configs[0]!.msg).toMatchObject({
        op: Op.CONFIG,
        id: "line",
        config: { color: "#f00" },
      });
    });

    it("identical config content in a new array reference is not re-sent", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const { rerender } = render(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "line", kind: "line", config: { color: "#fff" } }]}
        />,
      );
      // Fresh array + fresh config objects, structurally identical.
      rerender(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "line", kind: "line", config: { color: "#fff" } }]}
        />,
      );
      expect(configPosts(posts)).toHaveLength(0);
    });
  });

  it("defers when the pool is disposed, then mounts once it is replaced (mountKey bump)", () => {
    // StrictMode race: the first mount effect sees a disposed pool, bumps
    // mountKey and bails; the mountKey-driven re-run sees a live pool and mounts.
    // Flip isDisposed false after the first read so the retry settles (otherwise
    // setMountKey would loop forever).
    const { factory } = makeFakeWorkerFactory();
    let disposed = true;
    const pool = {
      get isDisposed() {
        const v = disposed;
        disposed = false;
        return v;
      },
      acquire: () => factory(),
    } as never;
    function PoolHarness() {
      const { containerRef } = useFluxionCanvas({
        layers: [{ id: "axis", kind: "axis-grid" }],
        hostOptions: { pool },
      });
      return <div ref={containerRef} />;
    }
    expect(() => render(<PoolHarness />)).not.toThrow();
  });
});
