# @heojeongbo/fluxion-replay

[![npm](https://img.shields.io/npm/v/@heojeongbo/fluxion-replay)](https://www.npmjs.com/package/@heojeongbo/fluxion-replay)

Time-travel replay for real-time dashboards. Record any stream of typed data (metrics, logs, ROS messages, screen video) and scrub back through the last N minutes — all in-browser with no backend.

Built for robotics, ROS2 monitoring, sensor dashboards, and anything that needs "what just happened?"

---

## How it works

```
┌─ ReplaySession ─────────────────────────────────────────┐
│                                                          │
│  record("cpu", { value: 72 })                           │
│       │                                                  │
│       ▼                                                  │
│  ReplayRecorder ──► GenericRingBuffer (memory)          │
│       │             TimelineIndex (sparse seek index)    │
│       │                                                  │
│       ▼                                                  │
│  ReplayStore ──► IndexedDB  (frame payloads, 500ms batch)│
│                  OPFS       (video chunks, async write)  │
│                                                          │
│  enterReplay() ──► ReplayPlayer                          │
│                      └── VirtualClock (RAF-based)        │
│                            └── prefetch → onFrame()      │
└──────────────────────────────────────────────────────────┘
```

- **Recording**: frames are batched into IndexedDB every 500ms. Old frames beyond `retentionMs` are evicted automatically.
- **Playback**: a `VirtualClock` drives a RAF loop. Frames are prefetched 2 seconds ahead from IDB into a memory buffer, then drained on each tick.
- **Video**: raw `VideoFrame`s from `MediaStreamTrackProcessor` are encoded via `VideoEncoder` (WebCodecs) and written to OPFS. On playback, `VideoDecoder` decodes chunks back to canvas.

---

## Installation

```bash
npm install @heojeongbo/fluxion-replay
# or
pnpm add @heojeongbo/fluxion-replay
```

---

## Quick start

```ts
import { createReplaySession, LogChannel, MetricChannel } from "@heojeongbo/fluxion-replay";

const session = createReplaySession({
  retentionMs: 10 * 60 * 1000,   // keep last 10 minutes
  channels: [
    new MetricChannel("cpu"),
    new MetricChannel("memory"),
    new LogChannel("system"),
  ],
});

await session.open();
await session.startRecording();

// Feed data from wherever (WebSocket, ROS bridge, polling…)
session.record("cpu", { name: "cpu", value: 72.4 });
session.record("system", { level: "warn", message: "GC triggered" });

// Enter replay at the beginning of the buffer
const player = await session.enterReplay();
player.onFrame(({ channelId, data, t }) => {
  console.log(channelId, data, new Date(t).toISOString());
});
player.play(1.0);   // 1× speed; try 0.5, 2, 4
```

---

## Channels

Channels define how data is serialized into `ArrayBuffer` for storage.

### `LogChannel`

Stores structured log entries as JSON.

```ts
import { LogChannel, type LogEntry } from "@heojeongbo/fluxion-replay";

const ch = new LogChannel("system");

session.record("system", {
  level: "warn",      // "debug" | "info" | "warn" | "error"
  message: "CPU spike detected",
  // any extra fields are preserved
} satisfies LogEntry);
```

### `MetricChannel`

Stores numeric samples in a compact binary format (`f64 value` + UTF-8 name/unit). Ideal for high-frequency sensor data.

```ts
import { MetricChannel, type MetricSample } from "@heojeongbo/fluxion-replay";

const ch = new MetricChannel("cpu");

session.record("cpu", {
  name: "cpu_usage",
  value: 72.4,
  unit: "%",          // optional
} satisfies MetricSample);
```

Binary layout: `[f64 value (8 bytes)] [u16 nameLen (2)] [u16 unitLen (2)] [name UTF-8] [unit UTF-8]`

### `RosChannel<T>`

Bring your own codec. Accepts any encode/decode pair so you can use CDR, Protobuf, MessagePack, or raw JSON.

```ts
import { RosChannel } from "@heojeongbo/fluxion-replay";

interface Pose { x: number; y: number; theta: number; }

const ch = new RosChannel<Pose>({
  channelId: "pose",
  encode: (data) => new TextEncoder().encode(JSON.stringify(data)).buffer,
  decode: (buf) => JSON.parse(new TextDecoder().decode(buf)) as Pose,
});
```

### `VideoChannel`

Stores WebCodecs-encoded video via OPFS. The IDB record contains only metadata (`opfsPath`, `isKeyframe`, `durationUs`, `byteLength`); the actual pixel data lives in OPFS. See [Video recording](#video-recording) below.

---

## Video recording

Video recording uses the **WebCodecs API** (`VideoEncoder` + `MediaStreamTrackProcessor`) to encode a `MediaStreamTrack` directly in the browser. Encoded chunks are written to **OPFS** (Origin Private File System) for fast sequential access without blocking the main thread.

### Requirements

| API | Chrome | Firefox | Safari |
|---|---|---|---|
| `VideoEncoder` / `VideoDecoder` | ✅ 94+ | ✅ 130+ | ✅ 15.4+ |
| `MediaStreamTrackProcessor` | ✅ 94+ | ✅ 102+ | ❌ (no support) |
| OPFS (`navigator.storage.getDirectory`) | ✅ 86+ | ✅ 111+ | ✅ 15.2+ |

> **Safari**: `MediaStreamTrackProcessor` is not supported. `VideoRecorder` automatically falls back to a no-op mode (metrics and logs still record normally; only video frames are skipped).

### Usage

```ts
import { VideoChannel, VideoRecorder, VideoReplayer } from "@heojeongbo/fluxion-replay";

const session = createReplaySession({
  retentionMs: 10 * 60 * 1000,
  channels: [new VideoChannel("screen")],
});
await session.open();
await session.startRecording();

// Get a screen capture track
const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
const track = stream.getVideoTracks()[0];

// Start encoding
const recorder = new VideoRecorder({
  channelId: "screen",
  store: session.store,
  recorder: session.recorder,
  // --- encoding options (all optional) ---
  codec: "vp8",         // default: "vp8"  |  alternatives: "vp09.00.10.08", "avc1.42E01E"
  width: 1280,          // default: 640
  height: 720,          // default: 480
  bitrate: 2_000_000,   // default: 1_000_000 (1 Mbps)
  framerate: 30,        // default: 30
  keyframeIntervalSec: 2, // default: 2  — keyframe every N seconds
});
await recorder.start(track);
```

### Playback

```ts
const player = await session.enterReplay();

const replayer = new VideoReplayer({
  channelId: "screen",
  store: session.store,
  outputCanvas: document.querySelector("canvas"),
  decoderConfig: {
    codec: "vp8",
    codedWidth: 1280,
    codedHeight: 720,
  },
});

player.onFrame((frame) => {
  if (frame.channelId === "screen") {
    replayer.feedFrame(frame);   // decodes chunk → draws to canvas
  }
});
player.play();
```

### How encoding works (step by step)

1. `MediaStreamTrackProcessor` converts the `MediaStreamTrack` into a `ReadableStream<VideoFrame>`.
2. Each `VideoFrame` is passed to `VideoEncoder.encode()`. Every `framerate × keyframeIntervalSec` frames is forced as a keyframe (`{ keyFrame: true }`).
3. The `VideoEncoder.output` callback fires with an `EncodedVideoChunk`. The chunk's `timestamp` is converted to a wall-clock millisecond: `tMs = startWallMs + (chunk.timestamp - startVideoUs) / 1000`.
4. The raw bytes are written to OPFS at `{channelId}/{tMs}.chunk` via `ReplayStore.writeVideoChunk()`.
5. A `VideoFrameInfo` metadata record `{ opfsPath, isKeyframe, durationUs, byteLength }` is recorded into IDB via `ReplayRecorder.record()`.

### How decoding works (step by step)

1. `ReplayPlayer` prefetches `VideoFrameInfo` records from IDB and emits them via `onFrame`.
2. `VideoReplayer.feedFrame()` reads the raw chunk from OPFS using the `opfsPath` stored in the metadata.
3. An `EncodedVideoChunk` is created and passed to `VideoDecoder.decode()`.
4. The `VideoDecoder.output` callback fires with a decoded `VideoFrame`, which is drawn to the canvas via `ctx.drawImage()`, then `frame.close()` is called to release GPU memory.

### Seeking

When seeking, `VideoReplayer.seekTo()`:
1. Closes the current `VideoDecoder` instance (avoids stale state).
2. Creates a fresh decoder and configures it.
3. Walks all frames from the last keyframe at or before `t` up to `t`, re-decoding them in order so the canvas is at exactly the right frame.

> Delta frames depend on all prior frames back to the last keyframe. Seeking always starts from a keyframe — this is why `keyframeIntervalSec` affects seek precision. A 2-second interval means seeks are accurate to within 2 seconds of extra decode work.

### Storage impact of video

Video dominates storage. IndexedDB holds only tiny metadata (~100 bytes/frame); the bulk is in OPFS.

| Bitrate | Resolution | 10 minutes | 1 hour |
|---|---|---|---|
| 500 Kbps | 1280×720 | ~37 MB | ~225 MB |
| 1 Mbps | 1280×720 | ~75 MB | ~450 MB |
| 2 Mbps | 1280×720 | ~150 MB | ~900 MB |
| 4 Mbps | 1920×1080 | ~300 MB | ~1.8 GB |

**Browser OPFS quotas:**

| Browser | Available quota |
|---|---|
| Chrome / Edge | ~60% of free disk space (typically tens of GB) |
| Firefox | ~50% of free disk space |
| Safari | Hard cap around **1 GB** total origin storage |

With `retentionMs: 10 * 60_000` and 2 Mbps, expect ~150 MB — well within limits on all browsers. For long-running sessions on Safari, drop to ≤500 Kbps or reduce resolution.

### Clearing stored data

`ReplaySession.clearRecording()` stops the recorder, wipes all IDB frames, removes all OPFS video chunks, then restarts the recorder. Useful for a "reset" button in the UI.

```ts
await session.clearRecording();
```

---

## React integration

```tsx
import {
  useReplaySession,
  useReplayPlayer,
  useReplayTimeline,
  ReplayTimeline,
} from "@heojeongbo/fluxion-replay/react";

function Dashboard() {
  const { session, isReady, mode, record, enterReplay, exitReplay } =
    useReplaySession({
      retentionMs: 10 * 60_000,
      channels: [new MetricChannel("cpu"), new LogChannel("system")],
    });

  const [player, setPlayer] = useState(null);
  const [timeRange, setTimeRange] = useState(null);

  const replayPlayer = useReplayPlayer(player);
  const timeline = useReplayTimeline(player, timeRange);

  // feed data
  useEffect(() => {
    const id = setInterval(() => {
      record("cpu", { name: "cpu", value: Math.random() * 100 });
    }, 200);
    return () => clearInterval(id);
  }, [record]);

  return (
    <>
      <ReplayTimeline
        timeline={timeline}
        formatTime={(t, earliest) =>
          new Date(t).toLocaleTimeString("en-US", { hour12: false })
        }
      />

      <button onClick={() => replayPlayer.player?.play()}>Play</button>
      <button onClick={() => replayPlayer.player?.pause()}>Pause</button>
      <span>{replayPlayer.state} — {replayPlayer.currentT}</span>
    </>
  );
}
```

### Hooks

All hooks live under `@heojeongbo/fluxion-replay/react`.

| Hook | What it gives you |
|---|---|
| `useReplaySession(opts)` | `{ session, isReady, mode, timeRange, record, enterReplay, exitReplay }` — owns IDB/OPFS lifecycle and toggles between live and replay modes. |
| `useReplayPlayer(player)` | `{ state, currentT, play, pause, stop, seek }` — mirrors the player into React state. `currentT` is **snapped to whole seconds** (1-Hz cursor) and refreshed via a 250 ms `setInterval` so heavy chart traffic can't starve the scrubber. |
| `useReplayScrubber(opts)` | `{ min, max, value, disabled }` — derives `<input type="range">` props snapped to 1 s, with a `recordingStartMs` anchor that pins the left edge and a `minSpanMs` floor that keeps the bar from collapsing at mount. |
| `useReplayTimeline(player, timeRange)` | `{ fraction, buffered, seekTo }` — normalized 0–1 position for low-level scrubber UIs. Used internally by `<ReplayTimeline>`. |
| `useReplayDvr(opts)` | `{ isDvr, player, frozenLatest, effectiveTimeRange, enter, exit }` — high-level DVR controller. Captures a "frozen latest" on entry so the scrubber stops drifting forward, optionally auto-plays on enter, and auto-exits to live when playback reaches the frozen edge. |
| `useLiveTimeRange(session, opts?)` | `{ timeRange, segments, seed }` — polls `session.getTimeRange()` and exposes recording segments. `seed()` lets you avoid the first-poll empty state. |
| `useChartReplay(opts)` | `{ isHydrating, hydratedCount }` — bridges a `ReplayPlayer` into a `fluxion-render` line layer. Backfills the trailing window on enter / seek and streams `onFrame` events into `handle.push`. Uses a sequential queue + microtask yield to defeat seek-burst and exit races. |
| `useChartLiveBackfill(opts)` | `void` — when `active` flips true (mount, DVR→live), flushes the store and rewrites the chart with the most recent window so the live chart picks up where DVR left off. Pairs with `useFluxionStream` for ongoing pushes. |
| `useVideoReplayer(opts)` | `{ ref, isReady }` — drives a `<video>` element from a video-channel `ReplayPlayer`. |
| `useStorageInfo(session, opts?)` | `{ usedBytes, quotaBytes, percentUsed, idbFrameCount }` — periodic IDB + OPFS quota inspector. |
| `useDisplayMedia()` | `{ stream, start, stop }` — thin wrapper around `navigator.mediaDevices.getDisplayMedia` used by the screen-capture demos. |
| `<ReplayTimeline />` | Headless scrubber built on `<input type="range">`. Styleable; uses `useReplayTimeline` under the hood. |

### `<ReplayTimeline />`

Headless scrubber built on `<input type="range">`. Fully styleable.

```tsx
<ReplayTimeline
  timeline={timeline}
  formatTime={(t, earliest) => `+${Math.floor((t - earliest) / 1000)}s`}
  style={{ width: "100%" }}
/>
```

---

## DVR / Time-travel pattern

`useReplayDvr` bundles the "freeze the live edge → seek → autoplay → auto-return to live" state machine that DVR-style UIs end up writing by hand. Combined with `useReplayScrubber` it gives you a video-timeline-style scrubber with 1-Hz cursor snap. The chart-replay demo wires it like this (paraphrased):

```tsx
const { session, isReady, enterReplay, exitReplay, record } = useReplaySession(SESSION_OPTS);
const { timeRange: liveTimeRange, seed } = useLiveTimeRange(session);

const dvr = useReplayDvr({
  session, enterReplay, exitReplay, liveTimeRange,
  rate: 1,
  // Phase-18 UX: scrub-then-play. Don't autoplay on enter — release of the
  // scrubber commits a play() so the user can hold the mouse to inspect any
  // past moment without the chart sliding out from under them.
  autoPlay: false,
});

const player = useReplayPlayer(dvr.player);

const { min, max, value, disabled } = useReplayScrubber({
  effectiveTimeRange: dvr.effectiveTimeRange,
  liveTimeRange,
  isDvr: dvr.isDvr,
  replayPlayerT: player.currentT,
  scrubT,                       // local "user is currently dragging" state
  recordingStartMs: timeOrigin, // anchors the left edge for the whole session
});

<input
  type="range"
  min={min} max={max} value={value} step={1000}
  disabled={disabled}
  onChange={(e) => {
    const t = Number(e.target.value);
    setScrubT(t);
    if (dvr.isDvr) dvr.player?.seek(t);          // mid-DVR live preview
    else if (t < max - 250) void dvr.enter(t);   // first cross into DVR
  }}
  onMouseUp={() => {
    if (dvr.isDvr) {
      dvr.player?.seek(scrubT!);
      dvr.player?.play(1);                       // release ⇒ play
    } else {
      void dvr.enter(scrubT!).then(() => dvr.player?.play(1));
    }
    setScrubT(null);
  }}
/>
```

What you get:

- **Frozen right edge** — `dvr.effectiveTimeRange.latest` snapshots the live edge at the moment of `enter()` so the scrubber stops drifting forward while you scrub.
- **Frozen left edge** — `useReplayScrubber.recordingStartMs` pins the bar's start to a wall-clock anchor (the page mount / session start), so the bar never "slides" as retention or polling moves the live earliest.
- **1-Hz cursor** — `useReplayPlayer` polls `player.currentT` every 250 ms and exposes a whole-second value, so a 40-chart page won't starve scrubber updates.
- **Scrub-then-play UX** — with `autoPlay: false`, the player stays idle while you drag; calling `play()` from `onMouseUp` resumes from the released point.
- **Auto-return to live** — when `currentT` reaches `frozenLatest`, `useReplayDvr` calls `exitReplay()` and the UI snaps back to live without extra wiring.

---

## Chart-replay pattern

`useChartReplay` + `useChartLiveBackfill` bridge a `ReplayPlayer` into a `fluxion-render` line layer without you having to write the IDB queries or worker-message orchestration:

```tsx
import { useFluxionStream } from "@heojeongbo/fluxion-render/react";
import { useChartReplay, useChartLiveBackfill } from "@heojeongbo/fluxion-replay/react";

// Live pump — keeps recording during DVR. Use a ref for `isLive` to avoid
// stale closures during the async `dvr.enter()` await.
const isLiveRef = useRef(isLive);
isLiveRef.current = isLive;

useFluxionStream({
  host,
  intervalMs: 1000 / 20,
  setup: (h) => h.line("line"),
  tick: (_t, handle) => {
    const wallT = Date.now();
    const y = sample(wallT);
    if (isLiveRef.current) handle.push({ t: wallT - timeOrigin, y });
    record("signal", { name: "signal", value: y }, wallT);
    return 1;
  },
});

// DVR path — backfills the trailing window on enter/seek and streams onFrame.
useChartReplay<MetricSample>({
  host: isLive ? null : host,
  player: isLive ? null : dvr.player,
  store: isLive ? null : session?.store ?? null,
  channel: signalChannel,
  layerId: "line",
  windowMs: 5_000,
  timeOrigin,
  pickValue: (d) => d.value,
});

// Live re-entry — wipes the chart and rewrites the most recent window so
// "Go Live" shows the data that accumulated during DVR.
useChartLiveBackfill<MetricSample>({
  host,
  store: session?.store ?? null,
  channel: signalChannel,
  layerId: "line",
  windowMs: 5_000,
  timeOrigin,
  pickValue: (d) => d.value,
  active: isLive,
});
```

Notes:

- `timeOrigin` is a per-page constant (`useMemo(() => Date.now(), [])`) that keeps wire-format timestamps inside `Float32`'s safe integer range. Pass the same value to `axisGridLayer({ timeOrigin })` so labels still show wall-clock time.
- `useChartReplay` serialises hydrate work: at most one IDB query is in flight, and additional `seek()` bursts collapse into a single "latest t" — drags settle in one or two visible updates, not dozens.
- `useChartLiveBackfill` calls `handle.reset(now)` synchronously when `active` flips true, then asynchronously refills from `store.getFramesByChannel`. The sync reset wins the FIFO race against any DVR hydrate that's still in flight, so the live chart never appears blank after a Go-Live.

---

---

## Session API

```ts
const session = createReplaySession(opts);

await session.open();               // opens IDB + OPFS
await session.startRecording();     // starts the recorder flush timer
session.record(channelId, data, timestamp?); // encode + buffer a frame (defaults to Date.now())
session.stopRecording();            // stops the flush timer
const player = await session.enterReplay(startT?, { timeRange? }); // create a player
session.exitReplay();               // dispose player, back to live mode
await session.getTimeRange();       // { earliest, latest } or null
await session.clearRecording();     // wipe all stored data, restart recorder
session.dispose();                  // cleanup everything
```

`enterReplay` accepts an optional `opts.timeRange` so callers can freeze the player's `latest` bound to the live edge the user actually saw at click time (`useReplayDvr` uses this). Inside, the session also calls `store.flush()` before reading `getTimeRange()` so the recorder's pending batch is visible to the new player — without that flush the last ~500 ms of frames would be a tail gap in the chart.

### `ReplaySession` options

| Option | Type | Default | Description |
|---|---|---|---|
| `channels` | `BaseChannel[]` | required | Channel instances to register |
| `retentionMs` | `number` | `600_000` (10 min) | How long to keep frames in IDB |
| `memoryCapacity` | `number` | `10_000` | Ring buffer capacity in frames |
| `indexIntervalMs` | `number` | `1_000` | Sparse timeline index granularity |
| `storeOptions.dbName` | `string` | `"fluxion-replay"` | IndexedDB database name |
| `storeOptions.batchIntervalMs` | `number` | `500` | IDB write batch interval |

---

## Player API

```ts
player.play(rate?)     // start or resume; rate defaults to 1.0
                       // ("idle" / "stopped" → resumes from the prior seek
                       //  target, not from earliest)
player.pause()
player.stop()          // resets to beginning
player.seek(t)         // jump to absolute timestamp (ms) — clamps into timeRange

player.onFrame(fn)     // ({ channelId, data, t }) => void
player.onTick(fn)      // (currentT: number) => void  — fires every RAF tick
player.onStateChange(fn) // ("idle" | "playing" | "paused" | "stopped") => void
player.onEnd(fn)       // fires when currentT >= timeRange.latest
player.onSeek(fn)      // (clampedT: number) => void  — fires after every seek

player.currentT        // current virtual timestamp (ms)
player.timeRange       // { earliest, latest } — read-only window captured at construction
player.state           // current playback state
player.dispose()
```

---

## Custom channel

Implement `BaseChannel<T>` to store any serializable data:

```ts
import type { BaseChannel } from "@heojeongbo/fluxion-replay";

interface ScanPoint { x: number; y: number; intensity: number; }

class LidarChannel implements BaseChannel<ScanPoint[]> {
  readonly channelId: string;
  readonly kind = "lidar";

  constructor(channelId: string) { this.channelId = channelId; }

  encode(points: ScanPoint[]): ArrayBuffer {
    const buf = new ArrayBuffer(points.length * 12);
    const view = new DataView(buf);
    points.forEach((p, i) => {
      view.setFloat32(i * 12,     p.x,         true);
      view.setFloat32(i * 12 + 4, p.y,         true);
      view.setFloat32(i * 12 + 8, p.intensity, true);
    });
    return buf;
  }

  decode(buf: ArrayBuffer): ScanPoint[] {
    const view = new DataView(buf);
    const count = buf.byteLength / 12;
    return Array.from({ length: count }, (_, i) => ({
      x:         view.getFloat32(i * 12,     true),
      y:         view.getFloat32(i * 12 + 4, true),
      intensity: view.getFloat32(i * 12 + 8, true),
    }));
  }
}
```

---

## Architecture

```
packages/fluxion-replay/src/
├── index.ts                          ← core exports
├── react.ts                          ← React hook/component exports
├── shared/
│   ├── model/
│   │   ├── frame.ts                  ← ReplayFrame, SerializedFrame types
│   │   ├── base-channel.ts           ← BaseChannel<T> interface
│   │   └── generic-ring-buffer.ts    ← in-memory ring buffer
│   └── lib/
│       └── virtual-clock.ts          ← RAF-based virtual clock
├── entities/
│   ├── log-channel/
│   ├── metric-channel/
│   ├── ros-channel/
│   └── video-channel/
├── features/
│   ├── store/model/replay-store.ts   ← IDB + OPFS persistence
│   ├── recorder/model/replay-recorder.ts
│   ├── player/model/replay-player.ts
│   ├── session/
│   │   ├── model/replay-session.ts
│   │   └── lib/create-replay-session.ts
│   ├── timeline/model/
│   │   ├── timeline-index.ts
│   │   └── thumbnail-store.ts
│   └── video/model/
│       ├── video-recorder.ts
│       └── video-replayer.ts
└── widgets/replay-timeline/
    ├── ui/replay-timeline.tsx
    └── lib/
        ├── use-replay-session.ts
        ├── use-replay-player.ts
        └── use-replay-timeline.ts
```

---

## License

MIT
