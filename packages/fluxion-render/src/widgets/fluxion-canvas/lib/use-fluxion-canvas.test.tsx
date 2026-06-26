import { act, render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Op } from "../../../shared/protocol";
import { _resetMountScheduler } from "./mount-scheduler";
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
  staggerMount = false,
}: {
  workerFactory: () => Worker;
  onHost?: (host: unknown) => void;
  staggerMount?: boolean;
}) {
  // Default `staggerMount: false` here so the mechanics tests below observe
  // synchronous host creation; the deferred default-on path is exercised in its
  // own describe block ("default staggered mount + dispose safety").
  const { containerRef, host } = useFluxionCanvas({
    layers: [
      { id: "axis", kind: "axis-grid" },
      { id: "line", kind: "line", config: { color: "#fff" } },
    ],
    hostOptions: { workerFactory },
    staggerMount,
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
        staggerMount: false, // exercise reconciliation against a synchronously-created host
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

  describe("structural reconciliation", () => {
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
        staggerMount: false, // exercise reconciliation against a synchronously-created host
      });
      return <div ref={containerRef} style={{ width: 200, height: 100 }} />;
    }

    const opsOf = (posts: RecordedPost[], op: number) =>
      posts.filter((p) => (p.msg as { op: number }).op === op);

    it("posts ADD_LAYER when a layer is added without a remount", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const { rerender } = render(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "axis", kind: "axis-grid" }]}
        />,
      );
      const before = opsOf(posts, Op.ADD_LAYER).length;
      rerender(
        <ConfigHarness
          workerFactory={factory}
          layers={[
            { id: "axis", kind: "axis-grid" },
            { id: "line", kind: "line", config: { color: "#fff" } },
          ]}
        />,
      );
      const added = opsOf(posts, Op.ADD_LAYER);
      expect(added.length).toBe(before + 1);
      expect(added.at(-1)!.msg).toMatchObject({
        op: Op.ADD_LAYER,
        id: "line",
        kind: "line",
      });
    });

    it("posts REMOVE_LAYER when a layer is dropped", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const { rerender } = render(
        <ConfigHarness
          workerFactory={factory}
          layers={[
            { id: "axis", kind: "axis-grid" },
            { id: "line", kind: "line", config: { color: "#fff" } },
          ]}
        />,
      );
      rerender(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "axis", kind: "axis-grid" }]}
        />,
      );
      const removed = opsOf(posts, Op.REMOVE_LAYER);
      expect(removed).toHaveLength(1);
      expect(removed[0]!.msg).toMatchObject({ op: Op.REMOVE_LAYER, id: "line" });
    });

    it("swaps a layer (REMOVE + ADD) when its kind changes", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const { rerender } = render(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "chart", kind: "line", config: { color: "#fff" } }]}
        />,
      );
      const addBefore = opsOf(posts, Op.ADD_LAYER).length;
      rerender(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "chart", kind: "area", config: { color: "#fff" } }]}
        />,
      );
      expect(opsOf(posts, Op.REMOVE_LAYER).at(-1)!.msg).toMatchObject({ id: "chart" });
      const lastAdd = opsOf(posts, Op.ADD_LAYER).at(-1)!.msg;
      expect(opsOf(posts, Op.ADD_LAYER).length).toBe(addBefore + 1);
      expect(lastAdd).toMatchObject({ op: Op.ADD_LAYER, id: "chart", kind: "area" });
    });

    it("does not touch structure when only configs change", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const { rerender } = render(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "line", kind: "line", config: { color: "#fff" } }]}
        />,
      );
      const adds = opsOf(posts, Op.ADD_LAYER).length;
      rerender(
        <ConfigHarness
          workerFactory={factory}
          layers={[{ id: "line", kind: "line", config: { color: "#f00" } }]}
        />,
      );
      expect(opsOf(posts, Op.ADD_LAYER).length).toBe(adds);
      expect(opsOf(posts, Op.REMOVE_LAYER)).toHaveLength(0);
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
        staggerMount: false,
      });
      return <div ref={containerRef} />;
    }
    expect(() => render(<PoolHarness />)).not.toThrow();
  });

  describe("staggerMount", () => {
    function StaggerHarness({
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
        staggerMount: true,
      });
      useEffect(() => {
        if (host && onHost) onHost(host);
      }, [host, onHost]);
      return <div ref={containerRef} style={{ width: 200, height: 100 }} />;
    }

    beforeEach(() => {
      _resetMountScheduler(); // isolate from any task another test left queued
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      _resetMountScheduler();
    });

    it("defers host creation to a later frame", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const onHost = vi.fn();
      render(<StaggerHarness workerFactory={factory} onHost={onHost} />);
      // Host creation is queued — nothing posted, no host yet.
      expect(posts).toHaveLength(0);
      expect(onHost).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(20); // drain one frame
      });
      const ops = posts.map((p) => (p.msg as { op: number }).op);
      expect(ops).toContain(Op.INIT);
      expect(onHost).toHaveBeenCalled();
    });

    it("cancels the queued creation if unmounted before its frame", () => {
      const { factory, posts, terminate } = makeFakeWorkerFactory();
      const { unmount } = render(<StaggerHarness workerFactory={factory} />);
      expect(posts).toHaveLength(0); // not created yet
      unmount(); // before the drain frame
      act(() => {
        vi.advanceTimersByTime(20);
      });
      expect(posts).toHaveLength(0); // host never created
      expect(terminate).not.toHaveBeenCalled(); // nothing to tear down
    });
  });

  describe("default staggered mount + dispose safety", () => {
    // No `staggerMount` here → exercises the library DEFAULT (deferred).
    function DefaultHarness({
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

    beforeEach(() => {
      _resetMountScheduler();
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      _resetMountScheduler();
    });

    it("defers host creation by default (no staggerMount prop)", () => {
      const { factory, posts } = makeFakeWorkerFactory();
      const onHost = vi.fn();
      render(<DefaultHarness workerFactory={factory} onHost={onHost} />);
      // Queued — nothing created until the frame drains.
      expect(posts).toHaveLength(0);
      expect(onHost).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(20));
      const ops = posts.map((p) => (p.msg as { op: number }).op);
      expect(ops).toContain(Op.INIT);
      expect(ops.filter((o) => o === Op.ADD_LAYER)).toHaveLength(2);
      expect(onHost).toHaveBeenCalled();
    });

    it("disposes the deferred host on unmount after it was created", () => {
      const { factory, terminate } = makeFakeWorkerFactory();
      const { unmount } = render(<DefaultHarness workerFactory={factory} />);
      act(() => vi.advanceTimersByTime(20)); // host created
      unmount();
      expect(terminate).toHaveBeenCalledTimes(1);
    });

    it("creates no host (leaks nothing) when unmounted before its frame", () => {
      const { factory, posts, terminate } = makeFakeWorkerFactory();
      const { unmount } = render(<DefaultHarness workerFactory={factory} />);
      unmount(); // before the drain frame
      act(() => vi.advanceTimersByTime(20));
      expect(posts).toHaveLength(0);
      expect(terminate).not.toHaveBeenCalled();
    });

    it("rapid mount/unmount churn before the frame creates no hosts", () => {
      const { factory, posts, terminate } = makeFakeWorkerFactory();
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(<DefaultHarness workerFactory={factory} />);
        unmount();
      }
      act(() => vi.advanceTimersByTime(20));
      expect(posts).toHaveLength(0);
      expect(terminate).not.toHaveBeenCalled();
    });
  });
});
