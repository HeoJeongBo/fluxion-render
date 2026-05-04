# fluxion-render

High-performance OffscreenCanvas rendering engine for real-time data visualization.

Built for robotics and sensor systems: streaming line charts, LiDAR point clouds, and high-frequency data pipelines up to 120Hz+. Rendering runs entirely in Web Workers — the main thread is never blocked.

> "Data is binary. Rendering is layered. UI is optional."

---

## Packages

| Package | Description |
|---------|-------------|
| [`packages/fluxion-worker`](packages/fluxion-worker) | Generic worker pool infrastructure — published as [`@heojeongbo/fluxion-worker`](https://www.npmjs.com/package/@heojeongbo/fluxion-worker) |
| [`packages/fluxion-render`](packages/fluxion-render) | Core rendering library — published as [`@heojeongbo/fluxion-render`](https://www.npmjs.com/package/@heojeongbo/fluxion-render) |
| [`examples/vite-demo`](examples/vite-demo) | Vite + React demo — Stream, Multi-stream, Static XY, LiDAR, Pool, fluxion-worker |

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

# Build all packages (worker first, then render)
pnpm build

# Run the demo app
pnpm --filter vite-demo dev

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
pnpm release:dry    # dry-run
```

### fluxion-worker

```bash
pnpm release:worker:patch
pnpm release:worker:minor
pnpm release:worker:major
pnpm release:worker:dry     # dry-run
```

Both run: typecheck → test → build → version bump → git tag (`fluxion-render-v*` / `fluxion-worker-v*`) → GitHub release → npm publish.

---

## License

MIT
