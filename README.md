# fluxion-render

High-performance OffscreenCanvas rendering engine for real-time data visualization — with time-travel replay built in.

Built for robotics and sensor systems: streaming line charts, LiDAR point clouds, high-frequency data pipelines up to 120Hz+, and in-browser recording/replay of any data stream. Rendering runs entirely in Web Workers — the main thread is never blocked.

> "Data is binary. Rendering is layered. UI is optional."

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`packages/fluxion-worker`](packages/fluxion-worker) | `0.3.0` | Generic worker pool infrastructure — [`@heojeongbo/fluxion-worker`](https://www.npmjs.com/package/@heojeongbo/fluxion-worker) |
| [`packages/fluxion-render`](packages/fluxion-render) | `0.8.2` | Core rendering library — [`@heojeongbo/fluxion-render`](https://www.npmjs.com/package/@heojeongbo/fluxion-render) |
| [`packages/fluxion-replay`](packages/fluxion-replay) | `0.3.0` | Time-travel replay engine — [`@heojeongbo/fluxion-replay`](https://www.npmjs.com/package/@heojeongbo/fluxion-replay) |
| [`examples/vite-demo`](examples/vite-demo) | — | Rendering demo — Stream, Multi-stream, Static XY, LiDAR, Pool |
| [`examples/fluxion-replay-demo`](examples/fluxion-replay-demo) | — | Replay demo — DVR/screen capture, metrics, logs, time-travel scrubber, plus a 40-chart DVR route with scrub-then-play UX |

---

## Architecture

```
Main Thread                          Worker Thread(s)
───────────────                      ──────────────────────────
FluxionHost × N                      FluxionWorkerPool (4 workers)
  │                                    │
  │──POOL_INIT (OffscreenCanvas)──────►│  Engine (one per host)
  │──ADD_LAYER ──────────────────────►│    LayerStack
  │──DATA (Float32Array transfer) ───►│      LineChartLayer
  │──RESIZE ──────────────────────────►│      LidarScatterLayer
  │──DISPOSE ─────────────────────────►│      AxisGridLayer
                                       │
                                       │  Scheduler (rAF-based)
                                       │    scan → draw → OffscreenCanvas

Replay (main thread)
────────────────────────────────────────────────────────
ReplayRecorder ──► IndexedDB (frames, 500ms batch)
                   OPFS      (video chunks, WebCodecs)
ReplayPlayer   ──► VirtualClock (RAF) → prefetch → onFrame()
```

- All rendering runs in workers — main thread is never blocked
- `ArrayBuffer` is **transferred** (not copied) on every data push
- 60 charts share 4 workers by default via the built-in worker pool
- Scheduler only renders when data changes (dirty flag)
- Replay stores up to 10 minutes of any stream in IndexedDB + OPFS

---

## Development

```bash
pnpm install

# Build all packages
pnpm build

# Run the rendering demo
pnpm --filter vite-demo dev

# Run the replay demo
pnpm dev:replay

# Typecheck + test all packages
pnpm typecheck
pnpm test
```

---

## Release

### fluxion-render

```bash
pnpm release:patch
pnpm release:minor
pnpm release:major
pnpm release:dry
```

### fluxion-worker

```bash
pnpm release:worker:patch
pnpm release:worker:minor
pnpm release:worker:major
pnpm release:worker:dry
```

### fluxion-replay

```bash
pnpm release:replay:patch
pnpm release:replay:minor
pnpm release:replay:major
pnpm release:replay:dry
```

Each release runs: typecheck → test → build → version bump → git tag → GitHub release → npm publish.

---

## License

MIT
