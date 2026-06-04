import { describe, expect, it } from "vitest";
import { formatBytes, formatMs } from "./format";

describe("formatMs", () => {
  it("zero-pads to mm:ss", () => {
    expect(formatMs(0)).toBe("00:00");
    expect(formatMs(5_000)).toBe("00:05");
    expect(formatMs(65_000)).toBe("01:05");
    expect(formatMs(600_000)).toBe("10:00");
  });

  it("clamps negatives to zero", () => {
    expect(formatMs(-1)).toBe("00:00");
    expect(formatMs(-99_999)).toBe("00:00");
  });

  it("floors sub-second remainders", () => {
    expect(formatMs(1_999)).toBe("00:01");
    expect(formatMs(59_999)).toBe("00:59");
  });
});

describe("formatBytes", () => {
  it("formats KB below 1 MB", () => {
    expect(formatBytes(0)).toBe("0.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1024 * 1024 - 1)).toMatch(/KB$/);
  });

  it("formats MB at and above 1 MB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(1024 * 1024 * 1024 - 1)).toMatch(/MB$/);
  });

  it("formats GB at and above 1 GB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });
});
