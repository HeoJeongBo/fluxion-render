import { ReplaySession, type ReplaySessionOptions } from "../model/replay-session";

export function createReplaySession(opts: ReplaySessionOptions): ReplaySession {
  return new ReplaySession(opts);
}
