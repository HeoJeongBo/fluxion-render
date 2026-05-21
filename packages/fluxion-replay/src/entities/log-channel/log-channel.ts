import type { BaseChannel } from "../../shared/model/base-channel";

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields?: Record<string, unknown>;
}

export class LogChannel implements BaseChannel<LogEntry> {
  readonly kind = "log";

  constructor(readonly channelId: string) {}

  encode(data: LogEntry): ArrayBuffer {
    return new TextEncoder().encode(JSON.stringify(data)).buffer as ArrayBuffer;
  }

  decode(buffer: ArrayBuffer): LogEntry {
    return JSON.parse(new TextDecoder().decode(buffer)) as LogEntry;
  }
}
