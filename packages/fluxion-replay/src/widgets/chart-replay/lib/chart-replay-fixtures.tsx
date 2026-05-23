import { vi } from "vitest";
import { MetricChannel } from "../../../entities/metric-channel/metric-channel";
import type { ReplayPlayerFrame } from "../../../features/player/model/replay-player";
import type { SerializedFrame } from "../../../shared/model/frame";
import { useChartReplay } from "./use-chart-replay";

// Shared test doubles for useChartReplay's tests and benches. Kept in lib/ so
// both .test.tsx and .bench.ts can import without circular paths.

export interface PushCall { id: string; sample: { t: number; y: number }; }
export interface PushBatchCall { id: string; samples: { t: number; y: number }[]; }
export interface ResetCall { id: string; latestT?: number; }

export function makeFakeHost() {
  const pushes: PushCall[] = [];
  const batches: PushBatchCall[] = [];
  const resets: ResetCall[] = [];
  const order: string[] = []; // order in which mutations happened

  const handle = {
    id: "signal",
    push: vi.fn((s: { t: number; y: number }) => {
      pushes.push({ id: "signal", sample: s });
      order.push(`push:${s.t}:${s.y}`);
    }),
    pushBatch: vi.fn((samples: readonly { t: number; y: number }[]) => {
      batches.push({ id: "signal", samples: [...samples] });
      order.push(`pushBatch:${samples.length}`);
    }),
    reset: vi.fn((latestT?: number) => {
      resets.push({ id: "signal", latestT });
      order.push(`reset:${latestT ?? "undef"}`);
    }),
  };

  const host = {
    line: vi.fn((_id: string) => handle),
  };

  return { host, handle, pushes, batches, resets, order };
}

export type FrameListener = (frame: ReplayPlayerFrame) => void;
export type SeekListener = (t: number) => void;

export function makeFakePlayer(initialT = 1000) {
  const frameListeners = new Set<FrameListener>();
  const seekListeners = new Set<SeekListener>();
  let currentT = initialT;

  return {
    get currentT() { return currentT; },
    setCurrentT(t: number) { currentT = t; },
    onFrame: vi.fn((l: FrameListener) => {
      frameListeners.add(l);
      return () => frameListeners.delete(l);
    }),
    onSeek: vi.fn((l: SeekListener) => {
      seekListeners.add(l);
      return () => seekListeners.delete(l);
    }),
    emitFrame(frame: ReplayPlayerFrame) {
      for (const l of frameListeners) l(frame);
    },
    emitSeek(t: number) {
      for (const l of seekListeners) l(t);
    },
    frameListenerCount() { return frameListeners.size; },
    seekListenerCount() { return seekListeners.size; },
  };
}

export function makeFakeStore(framesByChannel: Record<string, SerializedFrame[]>) {
  return {
    getFramesByChannel: vi.fn(
      async (channelId: string, fromMs: number, toMs: number): Promise<SerializedFrame[]> => {
        const all = framesByChannel[channelId] ?? [];
        return all.filter((f) => f.t >= fromMs && f.t <= toMs);
      },
    ),
  };
}

/**
 * Build a SerializedFrame with a MetricChannel-encoded payload.
 * The decoded `value` becomes the chart y.
 */
export function metricFrame(channelId: string, t: number, value: number): SerializedFrame {
  const ch = new MetricChannel(channelId);
  return { t, channelId, payload: ch.encode({ name: channelId, value }) };
}

export interface BuildRecordingOpts {
  /** Absolute base timestamp the first frame lands on. */
  origin: number;
  /** Sample rate in Hz. Frame spacing = 1000 / hz ms. */
  hz: number;
  /** Total recording length in ms (e.g. 60_000 for one minute). */
  durationMs: number;
  /** Defaults to "signal". */
  channelId?: string;
  /** Optional value generator. Receives the frame index. Defaults to a sine. */
  signalFn?: (i: number, hz: number) => number;
}

/**
 * Materialise a deterministic recording of `durationMs * hz / 1000` frames.
 * Used by tests for assertions and by benches for warmup payloads.
 */
export function buildRecording(opts: BuildRecordingOpts): SerializedFrame[] {
  const channelId = opts.channelId ?? "signal";
  const frameCount = Math.floor(opts.durationMs * (opts.hz / 1000));
  const signalFn = opts.signalFn ?? ((i, hz) => Math.sin((i / hz) * 0.6) * 0.8);
  const out: SerializedFrame[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    out[i] = metricFrame(
      channelId,
      opts.origin + i * (1000 / opts.hz),
      signalFn(i, opts.hz),
    );
  }
  return out;
}

// Stable channel instance — useChartReplay's effect deps include `channel`,
// so reusing one prevents spurious re-subscribes across renders.
export const SIGNAL_CHANNEL = new MetricChannel("signal");

export interface ChartReplayProbeProps {
  host: ReturnType<typeof makeFakeHost>["host"] | null;
  player: ReturnType<typeof makeFakePlayer> | null;
  store: ReturnType<typeof makeFakeStore> | null;
  windowMs: number;
  timeOrigin?: number;
  channel?: MetricChannel;
}

/**
 * Thin React harness that mounts `useChartReplay` with the fake shapes from
 * this fixtures module. Returned by `render()` so callers can `act()` around
 * it and inspect the spy arrays on the fake host.
 */
export function ChartReplayProbe(props: ChartReplayProbeProps) {
  const channel = props.channel ?? SIGNAL_CHANNEL;
  // biome-ignore lint: deliberate cast — props use the fake shapes that
  // structurally match the production interfaces but aren't nominally typed.
  useChartReplay({
    host: props.host as never,
    player: props.player as never,
    store: props.store as never,
    channel,
    windowMs: props.windowMs,
    timeOrigin: props.timeOrigin,
    pickValue: (d) => d.value,
  });
  return null;
}
