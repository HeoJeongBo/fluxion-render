import { act, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FluxionHost } from "../../../features/host";
import type { XyPoint } from "../../../features/host";
import { Op } from "../../../shared/protocol";
import { useFluxionHistorical } from "./use-fluxion-historical";

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

function makeHost() {
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const { factory, posts } = makeFakeWorkerFactory();
  const host = new FluxionHost(canvas, { workerFactory: factory });
  return { host, posts };
}

function Harness({
  host,
  layerId,
  data,
  layout,
}: {
  host: FluxionHost | null;
  layerId: string;
  data: readonly XyPoint[] | readonly number[] | null | undefined;
  layout?: "xy" | "y";
}) {
  useFluxionHistorical({ host, layerId, data, layout });
  return null;
}

const isData = (p: RecordedPost) => (p.msg as { op?: number })?.op === Op.DATA;

describe("useFluxionHistorical", () => {
  it("no-op when host is null", () => {
    expect(() =>
      render(<Harness host={null} layerId="line" data={[{ x: 0, y: 1 }]} />),
    ).not.toThrow();
  });

  it("no-op when data is null", () => {
    const { host, posts } = makeHost();
    const before = posts.length;
    render(<Harness host={host} layerId="line" data={null} />);
    expect(posts.length).toBe(before);
    host.dispose();
  });

  it("no-op when data is empty array", () => {
    const { host, posts } = makeHost();
    const before = posts.length;
    render(<Harness host={host} layerId="line" data={[]} />);
    expect(posts.length).toBe(before);
    host.dispose();
  });

  it("sends DATA message when xy data is provided", () => {
    const { host, posts } = makeHost();
    const data: XyPoint[] = [{ x: 0, y: 1 }, { x: 1, y: 2 }];
    render(<Harness host={host} layerId="line" data={data} />);
    const dataMsgs = posts.filter(isData);
    expect(dataMsgs.length).toBe(1);
    expect(dataMsgs[0].transfer).toBeDefined();
    host.dispose();
  });

  it("re-sends when data reference changes", () => {
    const { host, posts } = makeHost();

    function Container() {
      const [data, setData] = useState<XyPoint[]>([{ x: 0, y: 1 }]);
      useFluxionHistorical({ host, layerId: "line", data });
      return (
        <button onClick={() => setData([{ x: 1, y: 2 }, { x: 2, y: 3 }])}>
          update
        </button>
      );
    }

    const { getByRole } = render(<Container />);
    const before = posts.filter(isData).length;
    act(() => { getByRole("button").click(); });
    expect(posts.filter(isData).length).toBe(before + 1);
    host.dispose();
  });

  it("layout: y sends DATA via setY (buffer size = n * 4 bytes)", () => {
    const { host, posts } = makeHost();
    const data = [1, 2, 3, 4, 5];
    render(<Harness host={host} layerId="line" data={data} layout="y" />);
    const dataMsgs = posts.filter(isData);
    expect(dataMsgs.length).toBe(1);
    const transfer = dataMsgs[0].transfer as ArrayBuffer[];
    expect(transfer[0].byteLength).toBe(data.length * 4);
    host.dispose();
  });

  it("sends to new host after host swap", () => {
    const { host: host1, posts: posts1 } = makeHost();
    const { host: host2, posts: posts2 } = makeHost();
    const data: XyPoint[] = [{ x: 0, y: 1 }];

    function Container() {
      const [activeHost, setActiveHost] = useState<FluxionHost>(host1);
      useFluxionHistorical({ host: activeHost, layerId: "line", data });
      return <button onClick={() => setActiveHost(host2)}>switch</button>;
    }

    const { getByText } = render(<Container />);
    expect(posts1.filter(isData).length).toBe(1);

    act(() => { getByText("switch").click(); });
    expect(posts2.filter(isData).length).toBe(1);

    host1.dispose();
    host2.dispose();
  });
});
