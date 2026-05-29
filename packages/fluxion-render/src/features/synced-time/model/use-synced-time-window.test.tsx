import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FluxionHost } from "../../host";
import { useSyncedTimeWindow } from "./use-synced-time-window";

function makeHost() {
  const configLayer = vi.fn();
  return { configLayer } as unknown as FluxionHost;
}

type ResultCapture = ReturnType<typeof useSyncedTimeWindow>;

function Harness({
  initialMs,
  onResult,
}: {
  initialMs?: number;
  onResult?: (r: ResultCapture) => void;
}) {
  const result = useSyncedTimeWindow(initialMs);
  onResult?.(result);
  return <div data-testid="root">{result.windowMs}</div>;
}

describe("useSyncedTimeWindow — initial value", () => {
  it("initialises with default windowMs of 5000 when no arg is provided", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector("[data-testid='root']")!.textContent).toBe("5000");
  });

  it("initialises with provided initialMs", () => {
    const { container } = render(<Harness initialMs={10000} />);
    expect(container.querySelector("[data-testid='root']")!.textContent).toBe("10000");
  });

  it("initialises with zero ms when explicitly given 0", () => {
    const { container } = render(<Harness initialMs={0} />);
    expect(container.querySelector("[data-testid='root']")!.textContent).toBe("0");
  });
});

describe("useSyncedTimeWindow — setWindowMs", () => {
  it("updates windowMs when setWindowMs is called", () => {
    let captured: ResultCapture | undefined;
    const { container } = render(
      <Harness
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    act(() => {
      captured!.setWindowMs(3000);
    });
    expect(container.querySelector("[data-testid='root']")!.textContent).toBe("3000");
  });

  it("can update windowMs multiple times", () => {
    let captured: ResultCapture | undefined;
    const { container } = render(
      <Harness
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    act(() => {
      captured!.setWindowMs(2000);
    });
    act(() => {
      captured!.setWindowMs(8000);
    });
    expect(container.querySelector("[data-testid='root']")!.textContent).toBe("8000");
  });
});

describe("useSyncedTimeWindow — syncConfig", () => {
  it("syncConfig returns object with timeWindowMs matching current windowMs", () => {
    let captured: ResultCapture | undefined;
    render(
      <Harness
        initialMs={7000}
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    expect(captured!.syncConfig()).toEqual({ timeWindowMs: 7000 });
  });

  it("syncConfig reflects updated windowMs after setWindowMs", () => {
    let captured: ResultCapture | undefined;
    render(
      <Harness
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    act(() => {
      captured!.setWindowMs(1500);
    });
    expect(captured!.syncConfig()).toEqual({ timeWindowMs: 1500 });
  });

  it("syncConfig returns a new object reference on each call", () => {
    let captured: ResultCapture | undefined;
    render(
      <Harness
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    const a = captured!.syncConfig();
    const b = captured!.syncConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("useSyncedTimeWindow — bind", () => {
  it("calls host.configLayer with axis id and current windowMs", () => {
    const host = makeHost();
    let captured: ResultCapture | undefined;
    render(
      <Harness
        initialMs={6000}
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    act(() => {
      captured!.bind(host);
    });
    expect(host.configLayer).toHaveBeenCalledWith("axis", { timeWindowMs: 6000 });
  });

  it("calls host.configLayer with custom axisId when provided", () => {
    const host = makeHost();
    let captured: ResultCapture | undefined;
    render(
      <Harness
        initialMs={4000}
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    act(() => {
      captured!.bind(host, "my-axis");
    });
    expect(host.configLayer).toHaveBeenCalledWith("my-axis", { timeWindowMs: 4000 });
  });

  it("does nothing when host is null", () => {
    let captured: ResultCapture | undefined;
    render(
      <Harness
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    expect(() => {
      act(() => {
        captured!.bind(null);
      });
    }).not.toThrow();
  });

  it("bind uses updated windowMs after setWindowMs", () => {
    const host = makeHost();
    let captured: ResultCapture | undefined;
    render(
      <Harness
        initialMs={5000}
        onResult={(r) => {
          captured = r;
        }}
      />,
    );
    act(() => {
      captured!.setWindowMs(9000);
    });
    act(() => {
      captured!.bind(host);
    });
    expect(host.configLayer).toHaveBeenLastCalledWith("axis", { timeWindowMs: 9000 });
  });
});

describe("useSyncedTimeWindow — multiple instances", () => {
  it("two independent instances maintain independent state", () => {
    let r1Captured: ResultCapture | undefined;
    let r2Captured: ResultCapture | undefined;

    function MultiHarness() {
      const r1 = useSyncedTimeWindow(1000);
      const r2 = useSyncedTimeWindow(2000);
      r1Captured = r1;
      r2Captured = r2;
      return (
        <>
          <span data-testid="w1">{r1.windowMs}</span>
          <span data-testid="w2">{r2.windowMs}</span>
        </>
      );
    }

    const { container } = render(<MultiHarness />);
    act(() => {
      r1Captured!.setWindowMs(3000);
    });
    expect(container.querySelector("[data-testid='w1']")!.textContent).toBe("3000");
    expect(container.querySelector("[data-testid='w2']")!.textContent).toBe("2000");
  });
});
