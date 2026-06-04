// Core types
export type { ReplayFrame, SerializedFrame } from "./shared/model/frame";
export type { BaseChannel, ChannelSchema } from "./shared/model/base-channel";
export type { ChannelId } from "./shared/model/channel-types";
export { GenericRingBuffer } from "./shared/model/generic-ring-buffer";
export { VirtualClock } from "./shared/lib/virtual-clock";
export type { VirtualClockListener } from "./shared/lib/virtual-clock";

// Channels
export { LogChannel } from "./entities/log-channel/log-channel";
export type { LogEntry } from "./entities/log-channel/log-channel";
export { MetricChannel } from "./entities/metric-channel/metric-channel";
export type { MetricSample } from "./entities/metric-channel/metric-channel";
export { RosChannel } from "./entities/ros-channel/ros-channel";
export type { RosChannelOptions } from "./entities/ros-channel/ros-channel";
export { VideoChannel } from "./entities/video-channel/video-channel";
export type { VideoFrameInfo } from "./entities/video-channel/video-channel";

// Format & producer utilities (pure, no React)
export { formatBytes, formatMs } from "./shared/lib/format";
export {
  createNoisyMetricProducer,
  createRandomLogProducer,
} from "./shared/lib/producers";
export type {
  LogSample,
  MetricSampleShape,
  NoisyMetricProducerOptions,
  RandomLogProducerOptions,
  Rng,
} from "./shared/lib/producers";

// Timeline utilities
export { TimelineIndex } from "./features/timeline/model/timeline-index";
export { ThumbnailStore } from "./features/timeline/model/thumbnail-store";
export type { Thumbnail } from "./features/timeline/model/thumbnail-store";

// Storage
export { ReplayStore } from "./features/store/model/replay-store";
export type {
  DecodedFrame,
  RecordingSegment,
  ReplayStoreOptions,
  StorageInfo,
} from "./features/store/model/replay-store";

// Recorder
export {
  ReplayRecorder,
  UnknownChannelError,
} from "./features/recorder/model/replay-recorder";
export type { ReplayRecorderOptions } from "./features/recorder/model/replay-recorder";

// Player
export { ReplayPlayer } from "./features/player/model/replay-player";
export type {
  ReplayPlayerFrame,
  ReplayPlayerOptions,
  ReplayPlayerState,
  FrameListener,
  TickListener,
  StateListener,
  EndListener,
  SeekListener,
} from "./features/player/model/replay-player";

// Session (main orchestrator)
export { ReplaySession } from "./features/session/model/replay-session";
export { createReplaySession } from "./features/session/lib/create-replay-session";
export { detectGaps } from "./features/session/lib/detect-gaps";
export { snapTimeToSegment } from "./features/session/lib/snap-time-to-segment";
export type { GapInfo } from "./features/session/lib/detect-gaps";
export type { ReplaySessionOptions, ReplaySessionMode } from "./features/session/model/replay-session";

// Video subsystem
export { VideoRecorder } from "./features/video/model/video-recorder";
export type { VideoRecorderOptions } from "./features/video/model/video-recorder";
export { VideoReplayer } from "./features/video/model/video-replayer";
export type { VideoReplayerOptions, VideoDecoderConfig } from "./features/video/model/video-replayer";
