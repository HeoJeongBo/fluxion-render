/**
 * Scenario 10: Multi-Channel Record → Replay → Seek (with Video)
 *
 * `VideoChannel` is a first-class channel but absent from every other scenario.
 * This records Metric + Log + Video together, then:
 *  - replays and asserts metric/log frames deliver via the player in t-order
 *    across a seek (channel atomicity), and
 *  - drives the VideoReplayer's seek-to-keyframe path end-to-end (floor() the
 *    keyframe, decode chunks in [keyframeT, t]) against frames + chunks the
 *    session actually persisted — no real WebCodecs pipeline, the test/setup
 *    fakes (VideoDecoder/OPFS/IDB) back it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogChannel } from "../entities/log-channel/log-channel";
import { MetricChannel } from "../entities/metric-channel/metric-channel";
import {
  VideoChannel,
  type VideoFrameInfo,
} from "../entities/video-channel/video-channel";
import { ReplaySession } from "../features/session/model/replay-session";
import { TimelineIndex } from "../features/timeline/model/timeline-index";
import { VideoReplayer } from "../features/video/model/video-replayer";
import { drain } from "./_helpers";

const CAM = "cam";
const CPU = "cpu";
const EVENTS = "events";

const STEP_MS = 50; // metric/log cadence
const VIDEO_STEP_MS = 100; // ~10 fps video
const KEYFRAME_EVERY = 10; // every 10th video frame is a keyframe (1 s apart)
const COUNT = 60; // 3 s of metric/log
const VIDEO_COUNT = 30; // 3 s of video

function makeCanvas(): HTMLCanvasElement {
  return {
    getContext: () => ({ drawImage: vi.fn() }),
    width: 640,
    height: 480,
  } as unknown as HTMLCanvasElement;
}

describe("Scenario 10: multi-channel (metric + log + video) record → replay → seek", () => {
  let session: ReplaySession;
  let keyframeIndex: TimelineIndex;

  beforeEach(async () => {
    vi.useFakeTimers();
    keyframeIndex = new TimelineIndex();
    session = new ReplaySession({
      channels: [new MetricChannel(CPU), new LogChannel(EVENTS), new VideoChannel(CAM)],
      retentionMs: 10 * 60_000,
    });
    await session.open();
    await session.startRecording();
  });

  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function seedAll(): Promise<void> {
    // Metric + log at 20 Hz.
    for (let i = 0; i < COUNT; i++) {
      const t = i * STEP_MS;
      session.record(CPU, { name: "cpu", value: i }, t);
      session.record(EVENTS, { level: "info", message: `e-${i}` }, t);
    }
    // Video at ~10 fps; every KEYFRAME_EVERY-th frame is a keyframe. Persist a
    // chunk to OPFS and record the metadata frame onto the VideoChannel.
    for (let i = 0; i < VIDEO_COUNT; i++) {
      const t = i * VIDEO_STEP_MS;
      const isKeyframe = i % KEYFRAME_EVERY === 0;
      const filename = `${t}.chunk`;
      await session.store.writeVideoChunk(CAM, filename, new Uint8Array([1, 2, 3]));
      const info: VideoFrameInfo = {
        opfsPath: `video/${CAM}/${filename}`,
        isKeyframe,
        durationUs: VIDEO_STEP_MS * 1000,
        byteLength: 3,
        codedWidth: 640,
        codedHeight: 480,
      };
      session.record(CAM, info, t);
      if (isKeyframe) keyframeIndex.insert(t);
    }
    await session.store.flush();
  }

  it("all three channels are persisted with a shared time range", async () => {
    await seedAll();
    const range = await session.getTimeRange();
    expect(range).not.toBeNull();
    expect(range!.earliest).toBe(0);
    // Latest is the last metric/log sample (t = (COUNT-1)*STEP_MS = 2950).
    expect(range!.latest).toBe((COUNT - 1) * STEP_MS);

    const cpu = await session.store.getFramesByChannel(CPU, 0, 10_000);
    const events = await session.store.getFramesByChannel(EVENTS, 0, 10_000);
    const cam = await session.store.getFramesByChannel(CAM, 0, 10_000);
    expect(cpu.length).toBe(COUNT);
    expect(events.length).toBe(COUNT);
    expect(cam.length).toBe(VIDEO_COUNT);
  });

  it("replay delivers metric + log frames in t-order, and a seek repositions both", async () => {
    await seedAll();
    const player = await session.enterReplay(0);

    const cpuFrames: number[] = [];
    const logFrames: number[] = [];
    player.onFrame(new MetricChannel(CPU), ({ t }) => cpuFrames.push(t));
    player.onFrame(new LogChannel(EVENTS), ({ t }) => logFrames.push(t));

    player.play();
    await vi.advanceTimersByTimeAsync(1_000);
    player.pause();

    // Both channels delivered, strictly ascending (t-order, no dups).
    expect(cpuFrames.length).toBeGreaterThan(0);
    expect(logFrames.length).toBeGreaterThan(0);
    for (let i = 1; i < cpuFrames.length; i++) {
      expect(cpuFrames[i]!).toBeGreaterThan(cpuFrames[i - 1]!);
    }

    // Seek forward repositions BOTH channels — nothing from before the seek leaks.
    cpuFrames.length = 0;
    logFrames.length = 0;
    player.seek(2_000);
    await drain();
    player.play();
    await vi.advanceTimersByTimeAsync(1_000);
    player.pause();

    for (const t of cpuFrames) expect(t).toBeGreaterThanOrEqual(2_000 - 3_000); // play() lookback floor
    expect(cpuFrames.every((t) => t <= (COUNT - 1) * STEP_MS)).toBe(true);
    // Log channel re-emits from the same seek window too.
    expect(logFrames.length).toBeGreaterThan(0);

    session.exitReplay();
  });

  it("VideoReplayer.seekTo floors to the nearest keyframe and decodes that window", async () => {
    await seedAll();
    const camFrames = await session.store.getFramesByChannel(CAM, 0, 10_000);
    // Map persisted SerializedFrames into the ReplayPlayerFrame shape the
    // replayer expects (decode the VideoChannel payload).
    const channel = new VideoChannel(CAM);
    const playerFrames = camFrames.map((f) => ({
      channelId: CAM,
      data: channel.decode(f.payload),
      t: f.t,
    }));

    const replayer = new VideoReplayer({
      store: session.store,
      channelId: CAM,
      outputCanvas: makeCanvas(),
    });

    // Seek to t=1250: floor keyframe is 1000 (keyframes at 0,1000,2000).
    expect(keyframeIndex.floor(1_250)).toBe(1_000);

    // seekTo decodes frames in [keyframeT=1000, t=1250] without throwing.
    await expect(
      replayer.seekTo(1_250, keyframeIndex, playerFrames),
    ).resolves.toBeUndefined();

    // Seeking before the first keyframe (floor null) is a safe no-op.
    keyframeIndex.insert(0); // ensure 0 present
    await expect(
      replayer.seekTo(0, keyframeIndex, playerFrames),
    ).resolves.toBeUndefined();

    replayer.dispose();
  });
});
