import { describe, expect, it } from "vitest";
import { LogChannel } from "./log-channel";

describe("LogChannel", () => {
  const channel = new LogChannel("system-logs");

  it("has correct channelId and kind", () => {
    expect(channel.channelId).toBe("system-logs");
    expect(channel.kind).toBe("log");
  });

  it("round-trips a simple log entry", () => {
    const entry = { level: "info" as const, message: "Hello world" };
    const decoded = channel.decode(channel.encode(entry));
    expect(decoded).toEqual(entry);
  });

  it("round-trips an entry with fields", () => {
    const entry = {
      level: "error" as const,
      message: "Something broke",
      fields: { code: 42, path: "/api/foo" },
    };
    const decoded = channel.decode(channel.encode(entry));
    expect(decoded).toEqual(entry);
  });

  it("round-trips all log levels", () => {
    for (const level of ["debug", "info", "warn", "error"] as const) {
      const entry = { level, message: `msg-${level}` };
      expect(channel.decode(channel.encode(entry))).toEqual(entry);
    }
  });
});
