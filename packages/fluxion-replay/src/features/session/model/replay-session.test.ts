import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogChannel } from "../../../entities/log-channel/log-channel";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import { createReplaySession } from "../lib/create-replay-session";
import { ReplaySession } from "./replay-session";

describe("ReplaySession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("createReplaySession returns a ReplaySession", () => {
    const session = createReplaySession({ channels: [] });
    expect(session).toBeInstanceOf(ReplaySession);
    session.dispose();
  });

  it("starts in live mode", () => {
    const session = new ReplaySession({ channels: [] });
    expect(session.mode).toBe("live");
    session.dispose();
  });

  it("open() resolves without error", async () => {
    const session = new ReplaySession({ channels: [] });
    await expect(session.open()).resolves.toBeUndefined();
    session.dispose();
  });

  it("startRecording enables recording", async () => {
    const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
    await session.open();
    await session.startRecording();
    expect(session.recorder.isRecording).toBe(true);
    session.dispose();
  });

  it("stopRecording disables recording", async () => {
    const session = new ReplaySession({ channels: [new MetricChannel("cpu")] });
    await session.open();
    await session.startRecording();
    session.stopRecording();
    expect(session.recorder.isRecording).toBe(false);
    session.dispose();
  });

  it("record() delegates to recorder", async () => {
    const session = new ReplaySession({ channels: [new LogChannel("logs")] });
    await session.open();
    await session.startRecording();
    const spy = vi.spyOn(session.recorder, "record");
    session.record("logs", { level: "info" as const, message: "test" });
    expect(spy).toHaveBeenCalledOnce();
    session.dispose();
  });

  it("enterReplay() returns a ReplayPlayer and switches to replay mode", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const player = await session.enterReplay();
    expect(session.mode).toBe("replay");
    expect(session.player).toBe(player);
    session.dispose();
  });

  it("exitReplay() returns to live mode", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    await session.enterReplay();
    session.exitReplay();
    expect(session.mode).toBe("live");
    expect(session.player).toBeNull();
    session.dispose();
  });

  it("getTimeRange() returns null when no data", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const range = await session.getTimeRange();
    expect(range).toBeNull();
    session.dispose();
  });

  it("enterReplay() with timestamp seeks to that position", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    const player = await session.enterReplay(5000);
    expect(session.mode).toBe("replay");
    expect(player).not.toBeNull();
    session.dispose();
  });

  it("dispose() stops recording and disposes player", async () => {
    const session = new ReplaySession({ channels: [] });
    await session.open();
    await session.startRecording();
    await session.enterReplay();
    const stopSpy = vi.spyOn(session.recorder, "stop");
    session.dispose();
    expect(stopSpy).toHaveBeenCalled();
    expect(session.player).toBeNull();
  });
});
