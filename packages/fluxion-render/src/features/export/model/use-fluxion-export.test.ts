import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoverDataCache } from "../../crosshair/model/hover-data-cache";
import { useFluxionExport } from "./use-fluxion-export";

function makeCache() {
  const c = new HoverDataCache();
  c.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
  return c;
}

let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };
let createObjectURLMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;

const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  mockAnchor = { href: "", download: "", click: vi.fn() };
  createObjectURLMock = vi.fn().mockReturnValue("blob:fake-url");
  revokeObjectURLMock = vi.fn();

  vi.stubGlobal("URL", {
    createObjectURL: createObjectURLMock,
    revokeObjectURL: revokeObjectURLMock,
  });

  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string, ...rest: any[]) => {
      if (tag === "a") return mockAnchor as unknown as HTMLElement;
      return originalCreateElement(tag, ...rest);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useFluxionExport — exportCSV", () => {
  it("does not call download when cache has no layers registered", () => {
    const cache = new HoverDataCache();
    const { result } = renderHook(() => useFluxionExport({ cache }));
    act(() => {
      result.current.exportCSV();
    });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("generates a CSV with header row timestamp_ms + layer labels", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportCSV();
    });

    expect(capturedBlob).toBeDefined();
    return capturedBlob!.text().then((text) => {
      const lines = text.split("\n");
      expect(lines[0]).toBe("timestamp_ms,Series A");
    });
  });

  it("exportCSV produces a Blob with text/csv MIME type", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);

    const { result } = renderHook(() => useFluxionExport({ cache }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportCSV();
    });

    expect(capturedBlob).toBeDefined();
    expect(capturedBlob!.type).toBe("text/csv");
  });

  it("creates an anchor with blob URL and triggers click", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache }));

    act(() => {
      result.current.exportCSV();
    });

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(mockAnchor.href).toBe("blob:fake-url");
    expect(mockAnchor.download).toBe("fluxion-export.csv");
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
  });

  it("revokes object URL after click", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache }));

    act(() => {
      result.current.exportCSV();
    });

    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:fake-url");
  });

  it("uses custom filename prefix", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache, filename: "my-data" }));

    act(() => {
      result.current.exportCSV();
    });

    expect(mockAnchor.download).toBe("my-data.csv");
  });

  it("filters to a single layer when layerId is provided", () => {
    const c = new HoverDataCache();
    c.registerLayer("a", { capacity: 64, label: "Alpha", color: "#f00" });
    c.registerLayer("b", { capacity: 64, label: "Beta", color: "#0f0" });
    c.push("a", 100, 1.0);
    c.push("b", 100, 2.0);

    const { result } = renderHook(() => useFluxionExport({ cache: c }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportCSV("a");
    });

    return capturedBlob!.text().then((text) => {
      expect(text).toContain("Alpha");
      expect(text).not.toContain("Beta");
    });
  });
});

it("CSV header includes all layer labels when multiple layers are registered", () => {
  const c = new HoverDataCache();
  c.registerLayer("a", { capacity: 64, label: "Alpha", color: "#f00" });
  c.registerLayer("b", { capacity: 64, label: "Beta", color: "#0f0" });
  c.push("a", 100, 1.0);
  c.push("b", 200, 2.0);

  const { result } = renderHook(() => useFluxionExport({ cache: c }));

  let capturedBlob: Blob | undefined;
  createObjectURLMock.mockImplementation((b: Blob) => {
    capturedBlob = b;
    return "blob:fake-url";
  });

  act(() => {
    result.current.exportCSV();
  });

  return capturedBlob!.text().then((text) => {
    const header = text.split("\n")[0];
    expect(header).toBe("timestamp_ms,Alpha,Beta");
  });
});

describe("useFluxionExport — exportJSON", () => {
  it("generates valid JSON with layers array", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportJSON();
    });

    return capturedBlob!.text().then((text) => {
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty("layers");
      expect(Array.isArray(parsed.layers)).toBe(true);
      expect(parsed.layers).toHaveLength(1);
      expect(parsed.layers[0].id).toBe("a");
      expect(parsed.layers[0].label).toBe("Series A");
      expect(Array.isArray(parsed.layers[0].points)).toBe(true);
    });
  });

  it("JSON includes exportedAt ISO timestamp", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportJSON();
    });

    return capturedBlob!.text().then((text) => {
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty("exportedAt");
      expect(() => new Date(parsed.exportedAt)).not.toThrow();
    });
  });

  it("creates anchor with .json filename and application/json MIME type", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 1000, 1.5);
    const { result } = renderHook(() => useFluxionExport({ cache }));

    act(() => {
      result.current.exportJSON();
    });

    expect(mockAnchor.download).toBe("fluxion-export.json");
    expect(mockAnchor.click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
  });

  it("JSON Blob has application/json MIME type", () => {
    const cache = new HoverDataCache();
    cache.registerLayer("a", { capacity: 64, label: "Series A", color: "#f00" });
    cache.push("a", 5000, 3.14);

    const { result } = renderHook(() => useFluxionExport({ cache }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportJSON();
    });

    expect(capturedBlob).toBeDefined();
    expect(capturedBlob!.type).toBe("application/json");
  });

  it("empty cache still produces valid JSON with empty layers", () => {
    const cache = makeCache();
    const { result } = renderHook(() => useFluxionExport({ cache }));

    let capturedBlob: Blob | undefined;
    createObjectURLMock.mockImplementation((b: Blob) => {
      capturedBlob = b;
      return "blob:fake-url";
    });

    act(() => {
      result.current.exportJSON();
    });

    return capturedBlob!.text().then((text) => {
      const parsed = JSON.parse(text);
      expect(parsed.layers[0].points).toHaveLength(0);
    });
  });
});
