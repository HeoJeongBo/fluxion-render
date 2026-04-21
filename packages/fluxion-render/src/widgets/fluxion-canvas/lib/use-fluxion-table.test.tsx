import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxionHost } from "../../../features/host";
import { useFluxionTable } from "./use-fluxion-table";

type Row = { value: number; t: number };

function makeFakeWorkerFactory() {
  const factory = () =>
    ({
      postMessage: () => {},
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    }) as unknown as Worker;
  return { factory };
}

function makeHost() {
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const { factory } = makeFakeWorkerFactory();
  return new FluxionHost(canvas, { workerFactory: factory });
}

function Probe<T>({
  host,
  intervalMs,
  updateHz,
  maxRows,
  setup,
  tick,
  onRows,
  onRate,
}: {
  host: FluxionHost | null;
  intervalMs: number;
  updateHz?: number;
  maxRows?: number;
  setup: (h: FluxionHost) => T;
  tick: (t: number, s: T) => Row | null;
  onRows?: (rows: Row[]) => void;
  onRate?: (r: number) => void;
}) {
  const { rows, rate } = useFluxionTable({ host, intervalMs, updateHz, maxRows, setup, tick });
  onRows?.(rows);
  onRate?.(rate);
  return <div data-testid="count">{rows.length}</div>;
}

describe("useFluxionTable", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "Date", "performance"],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run when host is null", () => {
    const setup = vi.fn();
    const tick = vi.fn(() => ({ value: 1, t: 0 }));
    render(<Probe host={null} intervalMs={10} setup={setup} tick={tick} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(setup).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("runs setup once and tick on every data interval", () => {
    const host = makeHost();
    const setup = vi.fn(() => null);
    const tick = vi.fn((_t: number, _s: null) => ({ value: 1, t: _t }));
    render(<Probe host={host} intervalMs={10} setup={setup} tick={tick} />);
    vi.advanceTimersByTime(55);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(5);
    host.dispose();
  });

  it("flushes pending rows to state at updateHz frequency (1 Hz default)", () => {
    const host = makeHost();
    let capturedRows: Row[] = [];
    render(
      <Probe
        host={host}
        intervalMs={10}
        updateHz={1}
        setup={() => null}
        tick={(_t) => ({ value: _t, t: _t })}
        onRows={(r) => { capturedRows = r; }}
      />,
    );
    // Advance 500ms: tick fires ~50 times but flush interval hasn't fired yet
    vi.advanceTimersByTime(500);
    expect(capturedRows.length).toBe(0);
    // Flush fires at 1000ms
    act(() => { vi.advanceTimersByTime(500); });
    expect(capturedRows.length).toBeGreaterThan(0);
    host.dispose();
  });

  it("does not re-render between flushes (tick fires but rows stay empty)", () => {
    const host = makeHost();
    const tick = vi.fn((_t: number) => ({ value: _t, t: _t }));
    let capturedRows: Row[] = [];
    render(
      <Probe
        host={host}
        intervalMs={8}
        updateHz={1}
        setup={() => null}
        tick={tick}
        onRows={(r) => { capturedRows = r; }}
      />,
    );
    // 600ms: tick fires ~75 times, but flush interval (1Hz) hasn't fired yet
    vi.advanceTimersByTime(600);
    expect(capturedRows.length).toBe(0);
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(70);
    host.dispose();
  });

  it("trims to maxRows oldest rows on flush", () => {
    const host = makeHost();
    let capturedRows: Row[] = [];
    render(
      <Probe
        host={host}
        intervalMs={10}
        updateHz={1}
        maxRows={5}
        setup={() => null}
        tick={(_t) => ({ value: _t, t: _t })}
        onRows={(r) => { capturedRows = r; }}
      />,
    );
    act(() => { vi.advanceTimersByTime(2000); });
    expect(capturedRows.length).toBeLessThanOrEqual(5);
    host.dispose();
  });

  it("skips tick when tick returns null", () => {
    const host = makeHost();
    let capturedRows: Row[] = [];
    let callCount = 0;
    render(
      <Probe
        host={host}
        intervalMs={10}
        updateHz={1}
        setup={() => null}
        tick={() => { callCount++; return null; }}
        onRows={(r) => { capturedRows = r; }}
      />,
    );
    act(() => { vi.advanceTimersByTime(1100); });
    expect(callCount).toBeGreaterThan(0);
    expect(capturedRows.length).toBe(0);
    host.dispose();
  });

  it("reports rate in samples/sec after the 500ms window", () => {
    const host = makeHost();
    let latestRate = 0;
    render(
      <Probe
        host={host}
        intervalMs={10}
        updateHz={1}
        setup={() => null}
        tick={(_t) => ({ value: _t, t: _t })}
        onRate={(r) => { latestRate = r; }}
      />,
    );
    act(() => { vi.advanceTimersByTime(510); });
    expect(latestRate).toBeGreaterThan(50);
    host.dispose();
  });

  it("tick errors are caught and interval keeps running", () => {
    const host = makeHost();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    render(
      <Probe
        host={host}
        intervalMs={10}
        setup={() => null}
        tick={() => { calls++; throw new Error("boom"); }}
      />,
    );
    vi.advanceTimersByTime(55);
    expect(calls).toBeGreaterThanOrEqual(5);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    host.dispose();
  });

  it("cleans up both intervals on unmount", () => {
    const host = makeHost();
    const tick = vi.fn((_t: number) => ({ value: _t, t: _t }));
    const { unmount } = render(
      <Probe host={host} intervalMs={10} updateHz={2} setup={() => null} tick={tick} />,
    );
    vi.advanceTimersByTime(55);
    const callsBefore = tick.mock.calls.length;
    unmount();
    vi.advanceTimersByTime(200);
    expect(tick.mock.calls.length).toBe(callsBefore);
    host.dispose();
  });

  it("resets rows when host becomes null", () => {
    const host = makeHost();
    let capturedRows: Row[] = [];
    function Harness({ h }: { h: FluxionHost | null }) {
      const { rows } = useFluxionTable<null, Row>({
        host: h,
        intervalMs: 10,
        updateHz: 1,
        setup: () => null,
        tick: (_t) => ({ value: _t, t: _t }),
      });
      capturedRows = rows;
      return <div>{rows.length}</div>;
    }
    const { rerender } = render(<Harness h={host} />);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(capturedRows.length).toBeGreaterThan(0);
    act(() => { rerender(<Harness h={null} />); });
    expect(capturedRows.length).toBe(0);
    host.dispose();
  });

  it("survives StrictMode double-invoke without doubling the interval", () => {
    const host = makeHost();
    const tick = vi.fn((_t: number) => ({ value: _t, t: _t }));
    render(
      <StrictMode>
        <Probe host={host} intervalMs={10} updateHz={1} setup={() => null} tick={tick} />
      </StrictMode>,
    );
    vi.advanceTimersByTime(55);
    expect(tick.mock.calls.length).toBeLessThanOrEqual(6);
    host.dispose();
  });

  it("uses rAF flush loop when updateHz is 0", () => {
    const host = makeHost();
    let capturedRows: Row[] = [];
    render(
      <Probe
        host={host}
        intervalMs={10}
        updateHz={0}
        setup={() => null}
        tick={(_t) => ({ value: _t, t: _t })}
        onRows={(r) => { capturedRows = r; }}
      />,
    );
    // advance data ticks then trigger a rAF frame
    vi.advanceTimersByTime(50);
    act(() => { vi.advanceTimersByTime(16); });
    expect(capturedRows.length).toBeGreaterThan(0);
    host.dispose();
  });
});
