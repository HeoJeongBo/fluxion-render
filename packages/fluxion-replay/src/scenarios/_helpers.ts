import { LogChannel } from "../entities/log-channel/log-channel";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import type { ReplaySessionOptions } from "../features/session/model/replay-session";
import { ReplaySession } from "../features/session/model/replay-session";

export { LogChannel, MetricChannel };

export function makeSession(overrides?: Partial<ReplaySessionOptions>): ReplaySession {
  return new ReplaySession({
    channels: [new MetricChannel("cpu"), new LogChannel("events")],
    ...overrides,
  });
}

export function seedMetricFrames(
  session: ReplaySession,
  channelId: string,
  count: number,
  startT = 1_000,
  stepT = 1_000,
): void {
  for (let i = 0; i < count; i++) {
    session.record(channelId, { name: channelId, value: i }, startT + i * stepT);
  }
}

export function seedLogFrames(
  session: ReplaySession,
  channelId: string,
  count: number,
  startT = 1_000,
  stepT = 1_000,
): void {
  for (let i = 0; i < count; i++) {
    session.record(
      channelId,
      { level: "info" as const, message: `event-${i}` },
      startT + i * stepT,
    );
  }
}

/** Build a deterministic MetricChannel recording at a fixed Hz rate. */
export function buildMetricRecording(opts: {
  channelId: string;
  startT: number;
  durationMs: number;
  hz: number;
  valueFn?: (i: number) => number;
}): Array<{ channelId: string; t: number; value: number }> {
  const { channelId, startT, durationMs, hz, valueFn = (i) => i % 100 } = opts;
  const stepMs = 1000 / hz;
  const count = Math.floor(durationMs / stepMs);
  const frames: Array<{ channelId: string; t: number; value: number }> = [];
  for (let i = 0; i < count; i++) {
    frames.push({ channelId, t: startT + Math.round(i * stepMs), value: valueFn(i) });
  }
  return frames;
}

/** Drain microtask queue twice (enough for Promise chains). */
export const drain = (): Promise<void> =>
  Promise.resolve().then(() => Promise.resolve());
