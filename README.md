# fluxion-render

High-performance OffscreenCanvas rendering engine for real-time data visualization.

Built for robotics and sensor systems: streaming line charts, LiDAR point clouds, and high-frequency data pipelines up to 120Hz+. Rendering runs entirely in Web Workers — the main thread is never blocked.

> "Data is binary. Rendering is layered. UI is optional."

---

## Packages

| Package | Description |
|---------|-------------|
| [`packages/fluxion-render`](packages/fluxion-render) | Core library — published to npm as [`@heojeongbo/fluxion-render`](https://www.npmjs.com/package/@heojeongbo/fluxion-render) |
| [`examples/vite-demo`](examples/vite-demo) | Vite + React demo — Stream, Multi-stream, Static XY, LiDAR, Pool |

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
```

- All rendering runs in workers — main thread is never blocked
- `ArrayBuffer` is **transferred** (not copied) on every data push
- 60 charts share 4 workers by default via the built-in worker pool
- Scheduler only renders when data changes (dirty flag)

---

## Development

```bash
pnpm install

# Build the library
pnpm --filter @heojeongbo/fluxion-render build

# Run the demo app
pnpm --filter vite-demo dev

# Typecheck + test
pnpm --filter @heojeongbo/fluxion-render typecheck
pnpm --filter @heojeongbo/fluxion-render test
```

---

## Release

```bash
# Patch / minor / major
pnpm release:patch
pnpm release:minor
pnpm release:major

# Dry-run
pnpm --filter @heojeongbo/fluxion-render release:dry
```

Runs typecheck → test → build → version bump → git tag → GitHub release → npm publish.

---

## License

MIT
