# FluxionRender

High-performance rendering engine for real-time data visualization.

Designed for:
- LiDAR visualization
- Real-time charts
- High-frequency streaming data (30~120Hz+)
- Robotics / sensor systems

## Architecture

```
Data Source (ROS2 / Sensor)
        ↓
     Worker (OffscreenCanvas)
 compute / transform / render
        ↓
 Float32Array (TypedArray, transferable)
        ↓
     Main Thread
        ↓
 React (DOM events: resize, mount)
```

Binary-first, zero-copy, layered, offscreen-rendered.

## Packages

- [`packages/fluxion-render`](packages/fluxion-render) — the library
- [`examples/vite-demo`](examples/vite-demo) — Vite + React demo with Line / Sliding / LiDAR

## Development

```bash
pnpm install
pnpm --filter fluxion-render build
pnpm --filter vite-demo dev
```

## Philosophy

> "Data is binary. Rendering is layered. UI is optional."
> "Performance first, UX later."
