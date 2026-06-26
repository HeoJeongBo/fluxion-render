# @heojeongbo/fluxion-render

[![npm](https://img.shields.io/npm/v/@heojeongbo/fluxion-render)](https://www.npmjs.com/package/@heojeongbo/fluxion-render)
[![coverage](https://img.shields.io/badge/coverage-100%25%20lines-brightgreen)](#testing)

High-performance OffscreenCanvas rendering engine for real-time data visualization.

Built for robotics and sensor systems: streaming line charts, LiDAR point clouds, and high-frequency data pipelines up to 120Hz+. Rendering runs entirely in Web Workers — the main thread is never blocked.

```bash
npm install @heojeongbo/fluxion-render
```

> **Need time-travel replay?** See [`@heojeongbo/fluxion-replay`](https://www.npmjs.com/package/@heojeongbo/fluxion-replay) — record any data stream and scrub back through the last N minutes, including video.

---

## Features

- **Worker Pool** — charts share an adaptive pool that grows with load. Zero config required.
- **OffscreenCanvas** — all rendering happens off the main thread
- **Zero-copy data** — `Float32Array` ownership is transferred to the worker, never copied
- **React integration** — hooks and components included (`/react` subpath)
- **Framework-agnostic core** — use `FluxionHost` directly without React

---

## Quick Start

### React (recommended)

```tsx
import {
  axisGridLayer,
  lineLayer,
  useFluxionCanvas,
  useFluxionStream,
  useTimeOrigin,
} from '@heojeongbo/fluxion-render/react';

function Chart() {
  const timeOrigin = useTimeOrigin(); // stable Date.now() snapshot from first render

  const { containerRef, host } = useFluxionCanvas({
    layers: [
      axisGridLayer('axis', {
        xMode: 'time',
        timeWindowMs: 5000,
        timeOrigin,
        yMode: 'auto',
      }),
      lineLayer('signal', { color: '#4fc3f7', lineWidth: 1.5, capacity: 4096 }),
    ],
  });

  useFluxionStream({
    host,
    intervalMs: 1000 / 60,
    setup: (h) => h.line('signal'),
    tick: (tMs, handle) => {
      handle.push({ t: tMs, y: Math.sin(tMs / 500) });
      return 1;
    },
  });

  return <div ref={containerRef} style={{ width: '100%', height: 300 }} />;
}
```

### Even simpler: `useSimpleChart`

For the common "just show me live data" case, `useSimpleChart` bundles the time
origin, the `axis-grid + line` pair (capacity auto-sized from `hz` + `windowMs`),
and the stream pump behind a single `sample` callback:

```tsx
import { FluxionCanvas, useSimpleChart } from '@heojeongbo/fluxion-render/react';

function Live() {
  const { layers, setHost } = useSimpleChart({
    hz: 60,
    windowMs: 5000,
    color: '#4fc3f7',
    sample: (t) => Math.sin(t / 500),     // y at host-relative t (ms)
    axis: { gridDashArray: [3, 3] },      // optional theme overrides
  });

  return <FluxionCanvas layers={layers} onReady={setHost} style={{ height: 300 }} />;
}
```

**Multiple series?** `useMultiSeriesChart` takes a `series: { id, color, sample }[]`
and fans each tick out to every line — no manual layers/setup/tick triple-edit.
(Changing the *number* of series at runtime needs a `<FluxionCanvas key={...}>`
remount — config changes are reconciled, structural ones aren't.)

```tsx
const { layers, setHost } = useMultiSeriesChart({
  hz: 60,
  windowMs: 5000,
  distinguishBy: 'dash', // ← solid / dashed / dotted across the series
  series: [
    { id: 'a', color: '#4fc3f7', sample: (t) => Math.sin(t / 500) },
    { id: 'b', color: '#ffb060', sample: (t) => Math.cos(t / 400) },
  ],
});
return <FluxionCanvas key={2} layers={layers} onReady={setHost} />;
```

**Overlapping series?** When values sit on top of each other (flat or
slowly-varying signals), color alone can't separate the lines. `distinguishBy`
keeps them readable, deterministically (no runtime overlap detection):

- `distinguishBy: 'dash'` — each series gets a distinct dash pattern, cycling
  the exported `DASH_PATTERNS` palette (`dashPatternFor(i)`). Honest about
  position.
- `distinguishBy: 'offset'` (with `offsetStep` in data units) — spreads the
  series vertically (waterfall), lifting series *i* by `i * offsetStep`.
- Combine: `distinguishBy: ['dash', 'offset']`.

Both are color-independent and skip any series that sets the matching field
itself (`dashArray` / `yOffset`). It's pure styling — hover, export, and the
underlying samples are unaffected; with `'offset'`, auto-scaling grows to fit
the shifted lines so nothing clips. (You can also set `dashArray` / `yOffset`
directly on any `lineLayer` / `areaLayer` / `stepLayer`.)

**Heavily overlapping? Use lanes.** `'offset'` keeps one shared y-axis, so a
big spread makes the axis labels misleading. For genuinely overlapping streams,
`layout: 'lanes'` draws **each series in its own horizontal band**, auto-
normalized to *its own* range (small multiples / ECG style) — there is no
shared y-axis to lie about. The helper suppresses the y grid/labels and ignores
`offset` in this mode (`dash` still works per lane).

```tsx
const { layers, setHost } = useMultiSeriesChart({
  hz: 60, windowMs: 5000, layout: 'lanes',
  series: [
    { id: 'a', color: '#4fc3f7', sample: (t) => Math.sin(t / 500) },
    { id: 'b', color: '#ffb060', sample: (t) => 0.5 + Math.sin(t / 510) * 0.02 },
  ],
});
```

Low-level: set `laneIndex` / `laneCount` (+ optional `laneGapPx`) on any
`lineLayer` / `areaLayer` / `stepLayer` to band it yourself.

#### Dash palette (`DASH_PATTERNS` / `dashPatternFor`)

`distinguishBy: 'dash'` cycles a deterministic 5-entry palette. Import it to set
`dashArray` on a layer by hand, or to mirror the palette in a legend:

```ts
import { DASH_PATTERNS, dashPatternFor } from '@heojeongbo/fluxion-render';

dashPatternFor(i); // → a fresh copy of DASH_PATTERNS[i % 5], safe to pass to a config
```

| `i` | pattern | look |
|----|---------|------|
| 0 | `[]` | solid |
| 1 | `[6, 4]` | dashed |
| 2 | `[2, 3]` | dotted |
| 3 | `[10, 4, 2, 4]` | dash-dot |
| 4 | `[8, 3]` | long dash |

`DASH_PATTERNS` is `readonly`; `dashPatternFor(i)` returns a mutable copy so it
can be handed straight to `lineLayer({ dashArray })`.

### Vanilla JS

```ts
import { FluxionHost } from '@heojeongbo/fluxion-render';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const host = new FluxionHost(canvas, { bgColor: '#0b0d12' });

host.addLayer('axis', 'axis-grid', { xMode: 'time', timeWindowMs: 5000, yMode: 'auto' });
const line = host.addLineLayer('signal', { color: '#4fc3f7', capacity: 4096 });

const t0 = Date.now();
setInterval(() => {
  line.push({ t: Date.now() - t0, y: Math.sin(Date.now() / 500) });
}, 1000 / 60);
```

---

## Worker Pool

Every `FluxionHost` automatically uses a shared module-level pool — no setup
needed. Mounting 60 charts creates 60 hosts but only a handful of OS threads.

The default pool is **adaptive**: it starts small (**2 workers**) and grows on
demand toward a cap of `min(16, hardwareConcurrency − 1)` as charts mount, with
`targetPerWorker` tuned low because render-heavy charts benefit from spreading
across more threads. (Previously the default was a fixed 4 workers.)

```tsx
// No config — workers shared automatically, pool grows as charts mount
<FluxionCanvas layers={[...]} />
<FluxionCanvas layers={[...]} />
// ... 60 of these all share the same adaptive pool
```

**Adjust the pool** (call before creating any host):

```ts
import { configureDefaultPool } from '@heojeongbo/fluxion-render';

configureDefaultPool({ size: 2 });               // fixed 2-worker pool
configureDefaultPool({ size: 2, maxSize: 8 });   // start at 2, grow to 8 on demand
```

`getDefaultPool()` returns the current singleton pool (lazily created on first
use), and `configureDefaultPool({ size?, maxSize?, targetPerWorker?, workerFactory? })`
replaces it (disposing the old one) — call it before creating any host.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `size` | `number` | `2` (default pool) | Initial worker count, clamped `[1, 16]` |
| `maxSize` | `number` | `= size` (growth off) | Upper bound for runtime growth. When `> size`, the pool starts at `size` and spawns more on demand (up to `maxSize`) as average active hosts per worker reaches `targetPerWorker`. Clamped `[size, 16]` |
| `targetPerWorker` | `number` | `12` (min 1) | Active hosts per worker that triggers growth toward `maxSize`. Lower it for heavier per-host workloads (e.g. high-Hz streaming charts) so hosts spread across more workers sooner. Only matters when `maxSize > size` |

Since the pool can't observe per-stream Hz, **`targetPerWorker` is the tuning
knob**: high-Hz apps set it lower for more headroom per worker.

**Scoped pool** (React) — useful when a page needs its own isolated pool:

```tsx
import { useFluxionWorkerPool, FluxionCanvas } from '@heojeongbo/fluxion-render/react';

function Dashboard() {
  const pool = useFluxionWorkerPool({ size: 4 }); // disposed on unmount

  return (
    <>
      {charts.map((id) => (
        <FluxionCanvas key={id} hostOptions={{ pool }} layers={[...]} />
      ))}
    </>
  );
}
```

**Custom worker factory** — bypasses the pool entirely (solo mode):

```ts
const host = new FluxionHost(canvas, {
  workerFactory: () => new Worker('/my-worker.js', { type: 'module' }),
});
```

---

## Performance / many charts

`FluxionHostOptions` (the second arg to `new FluxionHost`, also passed as
`hostOptions` to `<FluxionCanvas>` / `useFluxionCanvas`) carries the throughput
knobs below. The defaults already coalesce and decimate, so a grid of high-rate
streams is cheap out of the box; the rest are opt-outs for niche cases.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `coalesce` | `boolean` | `true` | Coalesce high-frequency per-sample handle `push()` calls into **one** `Op.DATA` message per layer per animation frame instead of one `postMessage` per sample. Cuts postMessage volume from O(samples/sec) to O(layers × fps) and removes the per-sample `Float32Array(2)` allocation — essential for many high-rate (e.g. 500 Hz) streams. Adds up to one frame (~16 ms) of latency. Only the streaming handles' `push()` fast-path is coalesced; raw `pushData`, `pushBatch`, and the replace-style `set*` calls always post immediately (and first flush any pending staged data for that layer, preserving order). Set `false` to restore immediate per-sample posting |
| `coalesceMaxFloats` | `number` | `1_000_000` | Backpressure cap on staged Float32 elements per layer between flushes; on overflow the layer flushes immediately (never drops samples) |
| `maxFps` | `number` | uncapped | Cap the worker engine's render rate. For a large grid of streaming charts sharing a worker, capping to e.g. `30` roughly halves worker scan+draw CPU and is visually indistinguishable for a scrolling time window. Skipped frames keep pending data — nothing is dropped |
| `emitBounds` | `boolean` | `true` | Whether the worker posts `BOUNDS_UPDATE` to the main thread on auto y-bounds change. Set `false` when nothing consumes `onBoundsChange` / `getMetrics().bounds` (e.g. a thumbnail grid) to skip the per-frame postMessage |
| `emitTicks` | `boolean` | `true` | Whether the worker posts `TICK_UPDATE` for React-side axis rendering. Only relevant with `externalAxes={false}` and no `onTickUpdate` consumer; set `false` to skip per-frame tick computation + postMessage. No effect when axis canvases render in the worker (`externalAxes` / `xAxisElement` / `yAxisElement`) |

(Plus `bgColor`, `pool`, `workerFactory` covered above.)

**Putting it together for a wall of charts.** The adaptive default pool spreads
hosts across workers as charts mount; `coalesce` (on by default) collapses
per-sample posts to one message per layer per frame; per-layer `decimate` (auto)
makes each draw O(width) rather than O(samples); and `maxFps` caps the shared
worker's frame rate. For a read-only thumbnail grid, also set
`emitBounds: false` / `emitTicks: false` to drop the per-frame bookkeeping
postMessages:

```tsx
<FluxionCanvas
  hostOptions={{ coalesce: true, maxFps: 30, emitBounds: false, emitTicks: false }}
  layers={[
    axisGridLayer('axis', { xMode: 'time', timeWindowMs: 5000, yMode: 'auto' }),
    lineLayer('s', { color: '#4fc3f7', maxHz: 500 }), // decimate auto-engages
  ]}
/>
```

**Robustness.** A single throwing frame or listener no longer permanently stops
an engine: the worker render loop isolates the error (logs it and keeps the loop
running), and the bounds/tick/metrics emitters and the shared streaming ticker
isolate a throwing listener so it can't skip the others.

**Mount/unmount churn is safe.** Charts can be freely mounted and unmounted in
bulk — accordions, tabs, virtualized grids — without leaking GPU memory. Each
host's OffscreenCanvas backing store is released on `dispose()` (the canvas is
shrunk to `0×0` immediately rather than waiting for garbage collection), so
rapidly opening/closing a section of many charts can't accumulate orphaned GPU
surfaces and exhaust the context budget.

**Stagger a burst of mounts (`staggerMount`).** Mounting many charts in a single
frame — an accordion section expanding, a grid appearing — runs every host's
`transferControlToOffscreen` + worker init + first render at once, which can
make the page stutter for a beat. Set `staggerMount` on the canvas to defer host
creation through a shared frame-throttled queue: the placeholder is attached
immediately, but the host spins up on a later frame, so the burst spreads out
(`host` / `onReady` arrive deferred). Tune the rate globally:

```tsx
import { configureMountScheduler } from '@heojeongbo/fluxion-render/react';

configureMountScheduler({ perFrame: 6 }); // host creations per frame (default 4)

<FluxionCanvas staggerMount layers={[/* … */]} hostOptions={{ pool }} />
```

A chart unmounted before its turn in the queue is simply dropped — it never
creates a host.

---

## Layer Types

### `line` — Streaming time-series

Appends `{ t, y }` samples to a ring buffer. Ideal for sensor data at 30–120Hz.

```ts
lineLayer('signal', {
  color?: string,        // e.g. '#4fc3f7'
  lineWidth?: number,    // default 1
  capacity?: number,     // ring buffer size in samples (explicit)
  retentionMs?: number,  // data retention window in ms
  maxHz?: number,        // expected max sample rate — auto-calculates capacity
  visible?: boolean,     // show/hide without reinitialising the layer (default true)
  decimate?: boolean,    // min/max-decimate the DRAW at high sample density.
                         // Tri-state: omitted = AUTO (decimate only when oversampled),
                         // true = always when oversampled, false = always draw every
                         // sample. Also on area/step/scatter — see "Streaming decimation"
  maxGapMs?: number,     // break the stroke when consecutive samples are farther apart
                         // than this (bursty/intermittent streams show real holes
                         // instead of a bridging diagonal); also on area/step layers
  dashArray?: number[],  // setLineDash pattern in CSS px, default [] (solid). Use to
                         // distinguish overlapping series, e.g. [6, 4]; also on
                         // area/step layers (area dashes the outline, not the fill).
                         // Visual only — data, hover, and auto-scaling are unaffected.
  yOffset?: number,      // vertical offset added to every y at draw time, in DATA
                         // units, default 0. Lifts the series up/down to spread
                         // overlapping lines (waterfall); auto-scale grows to fit.
                         // Also on area/step layers. Visual only (hover/export = raw y).
  laneIndex?: number,    // lane (small-multiples) mode: draw this series in band
  laneCount?: number,    // `laneIndex` of `laneCount`, auto-normalized to its OWN
  laneGapPx?: number,    // y-range (own band, no shared y-axis). gap default 6 px.
                         // Also on area/step. See useMultiSeriesChart layout:'lanes'.
  opacity?: number,      // global stroke opacity 0–1, default 1. De-emphasize a
                         // series or let overlapping lines show through. Saved/
                         // restored around the draw so it never leaks into other
                         // layers. Also on `scatterLayer`. Visual only.
})
```

`retentionMs` + `maxHz` auto-calculate `capacity = ceil(retentionMs/1000 * maxHz * 1.1)`.  
Explicit `capacity` always takes priority when both are set. If the ring is too
small for the visible window — i.e. samples are evicted while still on screen —
the layer logs a one-time `[fluxion] Layer "id": ring capacity … is smaller than
the visible window` warning so silent data loss is visible during development.

#### Streaming decimation (`decimate`)

`decimate` is a shared, **tri-state** option on the `line`, `step`, `area`, and
`scatter` streaming layers that makes high-rate (e.g. 500 Hz) charts **O(width)**
instead of O(samples) to draw:

- **omitted (default) → AUTO** — decimate only when oversampled (visible samples
  > 2× pixel width).
- **`true`** — decimate whenever oversampled (same effect as auto).
- **`false`** — always draw every sample.

For `line` / `step` / `area` it draws a min/max envelope (~2–4 points per x-pixel
column), so it's **visually lossless** — every peak/trough at display resolution
is preserved; for `scatter` it thins to each column's min-y / max-y points. The
ring buffer still holds **every** sample, so hover, scan (y-auto bounds), and
export are unaffected.

**Toggling series visibility** — set `visible` to show/hide a layer without reinitialising the host or losing buffered data. For a single layer, `useLayerConfig` sends one lightweight CONFIG message:

```tsx
const [enabled, setEnabled] = useState({ s1: true, s2: true, s3: false });

// layers is fixed on mount — never recreated on toggle
const layers = useMemo(() => [
  axisGridLayer('axis', { ... }),
  lineLayer('s1', { color: '#4fc3f7' }),
  lineLayer('s2', { color: '#80ffa0' }),
  lineLayer('s3', { color: '#ffb060' }),
], []);

useLayerConfig(host, lineLayer('s1', { visible: enabled.s1 }));
```

**Toggling many series at once** — calling `useLayerConfig` per layer fires N postMessages and trips the rules-of-hooks lint when done in a loop. Use **`useLayersConfig`** (plural): it diffs the whole array and sends a **single batched** `CONFIG_BATCH` message containing only the changed layers:

```tsx
// One message per toggle, no matter how many series — and loop-friendly.
useLayersConfig(
  host,
  keys.map((k) => lineLayer(k, { visible: enabled[k] })),
);
```

Outside React, the host exposes the same batching directly:

```ts
host.configLayers([
  { id: 's1', config: { visible: false } },
  { id: 's2', config: { lineWidth: 2 } },
]);                                    // one postMessage, applied + redrawn once

host.setLayerVisibility('s1', false);  // single-layer convenience
host.setLayerVisibility({ s1: true, s2: false, s3: true }); // map → one batch
```

```ts
// Keep 10 seconds of data at up to 60Hz → capacity = 660
lineLayer('signal', { retentionMs: 10_000, maxHz: 60 })
```

Push data via `LineLayerHandle`:

```ts
const handle = host.addLineLayer('signal', { color: '#4fc3f7', capacity: 4096 });

// Single sample
handle.push({ t: tMs, y: value });

// Batch (more efficient at high rates)
handle.pushBatch([{ t: t1, y: v1 }, { t: t2, y: v2 }]);
```

### `line-static` — One-shot XY plot

Replaces the entire dataset on each push. For pre-computed or snapshot data.

```ts
lineStaticLayer('plot', {
  color?: string,
  lineWidth?: number,
  layout?: 'xy' | 'y',  // 'xy': interleaved [x,y,x,y,...], 'y': y-only array
})
```

```ts
const handle = host.addLineStaticLayer('plot', { color: '#80ffa0' });

// XY pairs
handle.pushXy([{ x: 0, y: 0 }, { x: 1, y: 1 }]);

// Y-only (x = index)
handle.pushY([0.1, 0.4, 0.9, 1.6]);
```

### `lidar` — Point cloud scatter

Efficient batch rendering of large point clouds (30k+ points at 120Hz). Uses counting-sort by intensity to minimize GPU state changes.

```ts
lidarLayer('scan', {
  stride?: 2 | 3 | 4,  // points per element: [x,y] | [x,y,z] | [x,y,z,intensity]
  pointSize?: number,
  intensityMax?: number,
  color?: string,       // base color (used when stride < 4)
})
```

```ts
const handle = host.addLidarLayer('scan', { stride: 4, pointSize: 2 });

// Push raw Float32Array: [x, y, z, intensity, x, y, z, intensity, ...]
handle.pushRaw(float32Array);

// Or push structured points
handle.push([{ x: 1.2, y: -0.4, z: 0, intensity: 0.8 }]);
```

### `area` / `step` — Filled / stepped time-series

Same streaming `{ t, y }` model and config as `line` (including `capacity` /
`retentionMs` / `maxHz`, `decimate`, `maxGapMs`, `dashArray`, `yOffset`, and the
`laneIndex` / `laneCount` / `laneGapPx` lane fields). `areaLayer` fills below the
stroke (dash applies to the outline, not the fill); `stepLayer` draws a
sample-and-hold staircase. Handles `AreaLayerHandle` / `StepLayerHandle` push the
same way as `LineLayerHandle` (`push` / `pushBatch` / `reset`).

```ts
areaLayer('a', { color: '#4fc3f7', /* …same fields as lineLayer */ });
stepLayer('s', { color: '#80ffa0' });
```

### More chart layers

The same `host.addLayer(id, kind, config)` / factory-spec pattern covers a family
of additional layer types. Each takes a `Float32Array` (or a typed handle method)
in the layout shown below; `t` is host-relative ms for streaming layers.

| Factory | `kind` | Data layout (stride) | Flow | Handle → key methods |
|---------|--------|----------------------|------|----------------------|
| `barLayer` | `bar` | `[x,y,…]` (2) or `[y,…]` (1, `layout:'y'`) | static | `BarLayerHandle` → `setXY` / `setY` |
| `scatterLayer` | `scatter` | `[t,y,…]` (2) | stream | `ScatterLayerHandle` → `push` / `pushBatch` / `reset` |
| `scatterColoredLayer` | `scatter-colored` | `[t,y,color,size,…]` (4, color/size 0–1) | stream | `ScatterColoredHandle` → `push` / `pushBatch` / `reset` |
| `candlestickLayer` | `candlestick` | `[t,open,high,low,close,…]` (5) | stream | `CandlestickLayerHandle` → `push` / `pushBatch` / `reset` |
| `eventMarkerLayer` | `event-marker` | `[t,severity,…]` (2; sev 0/1/2) | static | `EventMarkerHandle` → `setEvents` / `clearEvents` |
| `heatmapLayer` | `heatmap` | `[x,y,value,…]` (3) | static | `HeatmapLayerHandle` → `setGrid` |
| `heatmapStreamLayer` | `heatmap-stream` | `[t, v0…v_{yBins-1}]` (yBins+1) | stream | `HeatmapStreamHandle` → `pushColumn(t, values)` |
| `poseArrowLayer` | `pose-arrow` | `[t,y,theta,…]` (3; θ rad) | stream | `PoseArrowHandle` → `push` / `pushBatch` / `reset` |
| `referenceLineLayer` | `reference-line` | config-only (no data) | config | `ReferenceLineHandle` → `setReference(config)` |

Notable config fields (all have sensible defaults):

- **`barLayer`** — `color`, `barWidth`=8, `layout`=`'xy'|'y'`, `xRange`=`[0,1]` (for `'y'`).
- **`scatterLayer`** — `color`, `pointSize`=3, `shape`=`'square'|'circle'`, `opacity`=1 (global point opacity 0–1), `decimate` (tri-state, see [Streaming decimation](#streaming-decimation-decimate) — thins to per-column min-y/max-y points), ring sizing via `capacity`=2048 / `retentionMs` / `maxHz`.
- **`scatterColoredLayer`** — `colormap`=`'viridis'|'plasma'|'hot'|'gradient'` (+ `minColor`/`maxColor` for `'gradient'`), `minSize`=2 / `maxSize`=8, `shape`=`'circle'`.
- **`candlestickLayer`** — `upColor`=`#26a69a`, `downColor`=`#ef5350`, `bodyWidth`=6.
- **`eventMarkerLayer`** — `colors`=`[info, warning, error]`, `markerSize`=8, `lineWidth`=1.
- **`heatmapLayer`** / **`heatmapStreamLayer`** — `colormap`=`'viridis'|'plasma'|'hot'`, optional `minValue`/`maxValue` (auto if omitted); stream adds `yBins`=32, `maxCols`=256, `yRange`=`[0,1]`.
- **`poseArrowLayer`** — `arrowLength`=14, `arrowWidth`=5, `color`.
- **`referenceLineLayer`** — `y` (required), optional `bandMin`/`bandMax` (+ `bandOpacity`=0.12), `color`, `label`, `lineWidth`=1.5.

### Robot & distribution layers

Domain layers for robot dashboards and statistics. `t` is host-relative ms;
world-coordinate layers expect `axisGridLayer({ xMode: "fixed" })`.

| Factory | `kind` | Data layout (stride) | Flow | Handle → key methods |
|---------|--------|----------------------|------|----------------------|
| `trajectoryLayer` | `trajectory` | `[x,y,t,…]` (3; world x/y) | stream | `TrajectoryHandle` → `push` / `pushBatch` / `reset` |
| `occupancyGridLayer` | `occupancy-grid` | `[originX,originY,res,cols,rows,…cells]` | static | `OccupancyGridHandle` → `setGrid` |
| `histogramLayer` | `histogram` | `[v0,v1,…]` raw values (binned in-layer) | static | `HistogramHandle` → `setValues` |
| `stackedAreaLayer` | `stacked-area` | `[t,y0,y1,…]` (seriesCount+1) | stream | `StackedAreaHandle` → `push` / `pushBatch` / `reset` |
| `boxPlotLayer` | `box-plot` | `[x,min,q1,median,q3,max,…]` (6) | static | `BoxPlotHandle` → `setBoxes` |
| `polarLayer` | `polar` | `[theta,r,…]` (2; θ rad, r≥0) | static | `PolarHandle` → `setPoints` |
| `spectrogramLayer` | (`heatmap-stream` preset) | columns via `pushColumn(t, magnitudes)` | stream | `HeatmapStreamHandle` → `pushColumn` |

Notable config fields:

- **`trajectoryLayer`** — `color`, `colorByTime` (+ `colormap`=`'viridis'|'plasma'|'hot'`), `headMarker`=true / `headMarkerSize`=4, `fadeOlderMs`=0, ring sizing via `capacity`/`retentionMs`/`maxHz`.
- **`occupancyGridLayer`** — `occupiedColor`/`freeColor`/`unknownColor` (cell `-1`=unknown, `0..100`=probability), `showGridLines`, `gridLineColor`.
- **`histogramLayer`** — `binCount`=20, fixed or auto `range`, `density`, `gapPx`=1, `color`.
- **`stackedAreaLayer`** — `seriesCount` (sets stride), `colors[]`, `fillOpacity`=0.85, `normalize` (percent-stacked), `lineWidth`.
- **`boxPlotLayer`** — `color`/`lineColor`, `fillOpacity`=0.35, `boxWidth`=24, `capRatio`=0.5, `lineWidth`=1.5.
- **`polarLayer`** — `rMax` (auto if omitted), `closed`=true, `fillOpacity`, `showPoints`/`pointSize`, `showRings`=true / `ringCount`=4, `gridColor`, `insetPx`=8. Self-contained polar→pixel mapping (give it its own canvas; ignores cartesian y-scaling).
- **`spectrogramLayer`** — `freqBins`=64, `freqRange`=`[0,1]`, `maxCols`=256, `colormap`, `minDb`/`maxDb`. Thin preset over `heatmap-stream` (push a magnitude/dB column per frame).

### `axis-grid` — Axes and grid

Controls the viewport bounds for all layers. Does not receive data — configure via `axisGridLayer()` or `host.configLayer()`.

```ts
axisGridLayer('axis', {
  // X axis
  xMode?: 'fixed' | 'time',   // 'fixed': static range, 'time': sliding window
  xRange?: [min, max],        // xMode: 'fixed' only
  timeWindowMs?: number,      // xMode: 'time' only
  timeOrigin?: number,        // Date.now() at stream start (for clock labels)
  followClock?: boolean,      // xMode: 'time' — right edge tracks Date.now()-timeOrigin every
                              // frame (scrolls continuously with no data); requires timeOrigin
  xTickFormat?: string | { pattern?, precision?, suffix?, si? } | ((v: number) => string),
                              // string clock-pattern, worker-safe object, or function.
                              // object form works on every render path (see table below);
                              // function form applies React-side only

  // Y axis
  yMode?: 'fixed' | 'auto',   // 'auto': fits to visible data
  yRange?: [min, max],        // yMode: 'fixed' only
  yAutoPadding?: number,      // fractional padding for auto mode (default 0.1)
  yTickFormat?: { precision?, suffix?, si? } | ((v: number) => string),
                              // object form is worker-safe (works with externalAxes:
                              // precision via toFixed, unit suffix, k/M/G scaling);
                              // function form applies on the React side only

  // Appearance
  gridColor?: string,
  gridLineWidth?: number,     // grid line width in CSS px (default 1)
  axisColor?: string,
  labelColor?: string,
  font?: string,
  showXGrid?: boolean,
  showYGrid?: boolean,
  showAxes?: boolean,
  showXLabels?: boolean,
  showYLabels?: boolean,
})
```

#### Tick formatters and `externalAxes`

By default (`externalAxes`, the recommended path) tick labels are drawn by the
worker on a dedicated axis canvas. A **function** formatter can't cross the
worker boundary — it's stripped before `postMessage` and only re-applied on the
React side. Use the **string** or **object** form for worker-drawn labels:

| `xTickFormat` / `yTickFormat` form | Worker-drawn axis (`externalAxes`) | React-side tick set |
| --- | --- | --- |
| `string` (x: clock pattern `"HH:mm:ss"`) | ✅ | ✅ |
| object (`{ pattern?, precision?, suffix?, si? }`) | ✅ | ✅ |
| function `(v) => string` | ❌ (falls back to raw value) | ✅ |

For non-time axes or numeric labels, prefer the object form:
`xTickFormat: { precision: 1, suffix: 'ms' }`, `yTickFormat: { si: true, suffix: 'B' }`.

For wall-clock strings outside the axis (HUDs, table cells), `formatClock` and
`makeClockFormatter` apply the same pattern tokens (`HH` `H` `mm` `m` `ss` `s`
`SSS` `S`; anything else is literal):

```ts
import { formatClock, makeClockFormatter } from '@heojeongbo/fluxion-render';

formatClock(Date.now(), 'HH:mm:ss.SSS');     // → "14:07:32.481"
const fmt = makeClockFormatter('HH:mm:ss');   // reusable formatter
fmt(epochMs);
```

---

## React API

### `useFluxionCanvas(options)`

Creates the canvas, worker, and all layers. Returns a ref to attach to a container `<div>` and the `FluxionHost` instance.

```ts
const { containerRef, host } = useFluxionCanvas({
  layers: FluxionLayerSpec[],       // layer declarations (configs are live — see below)
  hostOptions?: FluxionHostOptions, // bgColor, pool, workerFactory + perf knobs
                                    // (coalesce / maxFps / emitBounds / emitTicks —
                                    // see "Performance / many charts")
  onReady?: (host) => void,         // called once after initialization
});
```

Layer **configs** inside `layers` are reconciled: when the array reference
changes, each layer's config is diffed by content and only changed ones are
re-sent to the worker. Memoize the array and list your config inputs as deps:

```tsx
const layers = useMemo(() => [
  axisGridLayer('axis', { xMode: 'time', followClock: isLive }),
  lineLayer('s1', { color, visible }),
], [isLive, color, visible]); // config changes auto-apply — no manual configLayer
```

Structural changes (adding/removing layers, changing a layer's `kind`) are
not reconciled — remount with a different `key` for those.

### `useFluxionStream(options)`

Drives a data loop via `setInterval`. Returns a measured sample rate.

```ts
const { rate } = useFluxionStream({
  host,                   // from useFluxionCanvas
  intervalMs: number,     // e.g. 1000/60 for 60Hz
  setup: (host) => T,     // called once — resolve typed handles here
  tick: (tMs, state) => number, // called every interval, return sample count
  shared?: boolean,       // opt into the shared ticker (default false) — see below
  trackRate?: boolean,    // measure pushed-samples/sec into `rate` (default true) — see below
});
```

`tMs` is milliseconds since the first tick (not `Date.now()`). Use it as the `t` value for line samples.

**Many streams at the same rate?** Pass `shared: true`. Instead of each stream
owning its own `setInterval`, all same-`intervalMs` streams coalesce onto **one**
process-wide timer that fans out to every subscriber — and it **pauses while the
page is hidden** (`document.hidden`), so background tabs stop pumping. This cuts
timer overhead dramatically on dashboards with dozens of small charts. Default
`false` preserves the original one-interval-per-stream behavior exactly.

**Not displaying `rate`?** Pass `trackRate: false`. By default (`true`) the hook
tracks the pushed-samples-per-second `rate` and refreshes it every 500 ms via
`setState` — a periodic re-render per stream. With it off, that periodic
re-render is skipped (and `rate` stays `0`), which matters for large grids of
hundreds of charts.

Need the shared timer outside `useFluxionStream`? Use the primitive directly:

```ts
import { useSharedTicker, subscribeTicker } from '@heojeongbo/fluxion-render/react';

// React: subscribe for the component's lifetime
useSharedTicker(1000 / 60, (now) => { /* … */ });

// Imperative: returns an unsubscribe; timer is cleared when the last sub leaves
const unsubscribe = subscribeTicker(1000 / 60, (now) => { /* … */ });
```

### `useTimeOrigin()`

Returns a stable `Date.now()` snapshot captured on the first render of the component. Use it as `timeOrigin` for `axisGridLayer` so timestamps on all charts are relative to the same epoch.

```ts
const timeOrigin = useTimeOrigin();
// timeOrigin is fixed for the lifetime of the component — never changes on re-render
```

### `useSyncedTimeWindow(initialMs?)`

Manages a shared `timeWindowMs` across a set of charts. Returns a state value plus utilities for syncing it to multiple hosts.

```ts
const {
  windowMs,          // current time window in ms (default 5000)
  setWindowMs,       // update the window and re-render
  timeOrigin,        // stable Date.now() snapshot (same as useTimeOrigin)
  syncConfig,        // () => { timeWindowMs, timeOrigin } — pass to axisGridLayer
  bind,              // (host, axisId?) => void — apply config to a live host
} = useSyncedTimeWindow(initialMs?);
```

```tsx
const tw = useSyncedTimeWindow(5000);
// ...
axisGridLayer('axis', { xMode: 'time', ...tw.syncConfig() })
// later, to change window for all bound hosts:
tw.setWindowMs(10000);
```

### `useFluxionWorkerPool(options)`

Creates a scoped `FluxionWorkerPool` that is disposed when the component unmounts.

```ts
const pool = useFluxionWorkerPool({
  size?: number,              // initial worker count, default 4
  maxSize?: number,           // grow on demand up to this (default = size, growth off)
  targetPerWorker?: number,   // hosts/worker that triggers growth (default 12)
  workerFactory: () => Worker, // required
});
```

### `useFluxionHistorical(options)`

Pushes a full dataset into a `line-static` layer whenever `data` changes. Handles are memoized — re-renders that don't change `data` are free.

```ts
useFluxionHistorical({
  host,                // FluxionHost | null — no-op while null
  layerId: string,     // must match a lineStaticLayer id
  data: readonly XyPoint[] | readonly number[] | null | undefined,
  layout?: 'xy' | 'y', // must match layout on lineStaticLayer config (default 'xy')
});
```

```tsx
const layers = useMemo(() => [
  axisGridLayer('axis', { xMode: 'fixed', xRange: [0, 100], yMode: 'auto' }),
  lineStaticLayer('plot', { color: '#4fc3f7', layout: 'xy' }),
], []);

const [host, setHost] = useState<FluxionHost | null>(null);

useFluxionHistorical({ host, layerId: 'plot', data: chartData });

return <FluxionCanvas layers={layers} onReady={setHost} />;
```

### `<FluxionLegend>`

React overlay legend rendered on top of the canvas. Zero performance cost — fully independent of the OffscreenCanvas render loop.

```tsx
import { FluxionLegend } from '@heojeongbo/fluxion-render/react';

// Always visible
<div style={{ position: 'relative', width: '100%', height: '100%' }}>
  <FluxionCanvas layers={layers} onReady={setHost} />
  <FluxionLegend
    items={[
      { color: '#4fc3f7', label: 'Signal A' },
      { color: '#80ffa0', label: 'Signal B' },
    ]}
    position="top-left"
  />
</div>

// Visible only on container hover
const containerRef = useRef<HTMLDivElement>(null);

<div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
  <FluxionCanvas layers={layers} onReady={setHost} />
  <FluxionLegend
    items={legendItems}
    visibility="hover"
    containerRef={containerRef}
    position="top-right"
  />
</div>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `LegendItem[]` | required | `{ color: string, label: string }[]` |
| `visibility` | `'always' \| 'hover'` | `'always'` | Always shown, or fade in on hover |
| `position` | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'top-right'` | Corner anchor |
| `containerRef` | `RefObject<HTMLElement>` | — | Hover target in `'hover'` mode. Falls back to the legend's parent element |
| `style` | `CSSProperties` | — | Additional styles |

### `useFluxionTable(options)`

Drives a high-frequency data pump (same pattern as `useFluxionStream`) and throttles React state updates to a configurable low frequency via `updateHz`. The data tick runs at `intervalMs` — only the flush into React state triggers a re-render.

```ts
const { rows, rate } = useFluxionTable({
  host,                        // FluxionHost | null
  intervalMs: 1000 / 120,      // data tick rate (120 Hz)
  updateHz: 1,                 // React re-render rate (default 1 Hz). 0 = rAF
  maxRows: 20,                 // max rows kept (default 50, oldest trimmed)
  setup: (host) => T,          // called once — resolve handles or per-stream state
  tick: (tMs, state) => R | null, // return a row object to append, or null to skip
});
```

`tick` can push to chart handles **and** return a row in the same call — chart and table share one data pump without doubling work:

```tsx
const { rows, rate } = useFluxionTable({
  host,
  intervalMs: 1000 / 120,
  updateHz: 2,
  maxRows: 20,
  setup: (h) => ({ line: h.line('signal') }),
  tick: (tMs, { line }) => {
    const y = Math.sin(tMs / 500);
    line.push({ t: tMs, y });          // → chart
    return { t: tMs.toFixed(0), y: y.toFixed(4) }; // → table row
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `FluxionHost \| null` | required | No-op while null |
| `intervalMs` | `number` | required | Data tick interval |
| `updateHz` | `number` | `1` | React re-render frequency. `0` uses `requestAnimationFrame` |
| `maxRows` | `number` | `50` | Max rows; oldest are dropped when exceeded |
| `setup` | `(host) => T` | required | One-shot initializer |
| `tick` | `(tMs, state) => R \| null` | required | Called every interval; `null` skips the row |

Returns `{ rows: R[], rate: number }`.

### `<FluxionTable>`

Unstyled table renderer. Pair with `useFluxionTable` for throttled rendering.

```tsx
import { FluxionTable } from '@heojeongbo/fluxion-render/react';

<FluxionTable
  columns={[
    { key: 'id',    header: 'ID' },
    { key: 'value', header: 'Value', render: (v) => <strong>{v}</strong> },
    { key: 'time',  header: 'Time' },
  ]}
  rows={rows}
  classNames={{
    root:  'my-table-wrap',
    table: 'my-table',
    thead: 'my-thead',
    tbody: 'my-tbody',
    tr:    'my-tr',
    th:    'my-th',
    td:    'my-td',
  }}
  style={{ fontSize: 12 }}
/>
```

| Prop | Type | Description |
|------|------|-------------|
| `columns` | `FluxionTableColumn<R>[]` | `{ key, header, render?, sortable? }` — `render` receives `(value, row)`; `sortable` makes the header click-to-sort |
| `rows` | `R[]` | Row data objects |
| `classNames` | `FluxionTableClassNames` | Per-element CSS class names. All optional |
| `style` | `CSSProperties` | Applied to the root wrapper `<div>` |
| `stickyHeader` | `boolean` | Keep the header row pinned while the body scrolls. Pair with a fixed `maxHeight` via `style`. Default `false` |
| `virtual` | `{ rowHeight, height, overscan?, scrollThrottleMs? }` | Virtualize rows: only the visible window (+ overscan) is rendered, so thousands of rows stay smooth. Requires a fixed `rowHeight` + viewport `height` in px. Omit for render-all |

`virtual.scrollThrottleMs` coalesces scroll-driven re-renders to at most one per
interval (leading + trailing): on high-refresh displays a large virtual table can
otherwise flood React with renders. Omit it for the default — re-render on every
scroll event.

No default styles are applied — layout and appearance are fully controlled via `classNames`.

### `useLayerConfig(host, layerSpec)`

Reactively updates a layer's config when the spec changes. Since configs
declared in the `layers` array now auto-apply (see `useFluxionCanvas`), this
hook is mainly for configs managed outside that array — it remains fully
supported either way.

```ts
const [windowMs, setWindowMs] = useState(5000);
useLayerConfig(host, axisGridLayer('axis', { timeWindowMs: windowMs }));
```

### `useLayersConfig(host, layerSpecs)`

Plural `useLayerConfig`. Diffs an **array** of specs and emits a single batched
`host.configLayers(...)` for only the entries whose config changed — replacing
the `useLayerConfig`-in-a-loop pattern (which fires N postMessages and trips the
rules-of-hooks lint). Ideal for toggling visibility across a grid of series:

```ts
useLayersConfig(host, keys.map((k) => lineLayer(k, { visible: visible.has(k) })));
```

### `useMiniChart(options)`

The `axis-grid + line` factory every "small chart in a grid" demo kept rewriting. Returns a memoised `layers` array ready for `<FluxionCanvas>`; sets up time-mode axis + ring-sized line layer from a single options object.

```tsx
import { FluxionCanvas, useMiniChart } from '@heojeongbo/fluxion-render/react';

function MiniChart({ color }: { color: string }) {
  const [host, setHost] = useState<FluxionHost | null>(null);
  const { layers } = useMiniChart({
    color,
    timeWindowMs: 5000,
    timeOrigin,   // shared per-page anchor for Float32 timestamps
    sampleHz: 60, // derives capacity = ceil(5 * 60 * 1.5) = 450
  });
  return <FluxionCanvas layers={layers} onReady={setHost} />;
}
```

Override the axis or line config with the optional `axis` / `line` fields when you need labels, custom grid colours, etc.

### `useHoverDataCache(options?)`

Creates a stable ring-buffer cache of `[t, y]` samples per layer, used to drive a
crosshair tooltip that shows **real** values (raw `y`, lane/offset-independent).
Pass `layers` to auto-register every hoverable layer (axis-grid is skipped), then
feed it samples via the returned `push` / `pushBatch` (or hand `cache` to a hook
like `useSimpleChart` / `useMultiSeriesChart`, which populate it for you).

```ts
const { cache, push, pushBatch } = useHoverDataCache({
  layers,                                  // auto-register; or omit and registerLayer manually
  overrides: { s1: { capacity: 4096, label: 'Signal A', color: '#4fc3f7' } },
});

push('s1', tMs, y);                        // single sample
pushBatch('s1', new Float32Array([t0, y0, t1, y1])); // interleaved [t,y,…]
```

The returned `cache` (a `HoverDataCache`) exposes:

| Method | Purpose |
|--------|---------|
| `registerLayer(id, opts?)` | register a layer (capacity default 2048, label, color) |
| `push(id, t, y)` / `pushBatch(id, arr)` | append samples |
| `findNearest(id, targetT, xMin)` | nearest `{ t, y }` at/after `xMin` (crosshair lookup) |
| `getPoints(id)` | all buffered `{ t, y }` for a layer, chronological |
| `getLatestT()` | most recent `t` across all layers |
| `getLayers()` | registered `{ id, label, color }[]` |
| `clear(id?)` | clear one layer, or all when `id` omitted |

### `useFluxionCrosshairFromLayers(options)`

Convenience wrapper over the crosshair that reads its time-window config
(`xMode` / `timeWindowMs` / `timeOrigin` / `xRange`) straight from the axis-grid
layer in `layers` — no need to repeat the axis props. Returns a `chartRef` for
the pointer-capture `<div>` and a `state` to feed `<FluxionCrosshair>`.

`cache` is **optional**: omit it and the hook creates and manages a
`HoverDataCache` for you (auto-registered from `layers`), and returns it on the
result alongside `push` / `pushBatch` so you can feed it from your stream tick —
the common single-chart case needs no separate `useHoverDataCache()` call.

```tsx
const { chartRef, state, push } = useFluxionCrosshairFromLayers({
  host,                 // FluxionHost | null
  layers,               // same array passed to <FluxionCanvas>; cache auto-registers from it
  axisLayerId: 'axis',  // default 'axis'
  yPadPx: 8,            // match the axis layer's yPadPx
  yFormat: (y) => y.toFixed(3),
});

// mirror each sample into the hover cache from your pump:
useFluxionStream({
  host,
  setup: (h) => h.line('line'),
  tick: (t, line) => { const y = next(t); push('line', t, y); line.push({ t, y }); return 1; },
});

return (
  <div style={{ position: 'relative' }}>
    <FluxionCanvas layers={layers} onReady={setHost} />
    <div ref={chartRef} style={{ position: 'absolute', inset: 0 }} />
    <FluxionCrosshair state={state} style={{ position: 'absolute', inset: 0 }} />
  </div>
);
```

Pass an explicit **`cache`** only when you need to share it (e.g. with
`useFluxionExport`) or mirror it for managed-pool fan-out — the returned
`push`/`pushBatch` then target whichever cache is active. For a long, high-rate
window where the default hover ring would evict samples while they're still
on-screen, size it per layer with **`overrides`**:

```tsx
useFluxionCrosshairFromLayers({
  host, layers,
  overrides: { s1: { capacity: 8192 }, s2: { capacity: 8192 } },
});
```

`state.points[]` carries one `{ layerId, label, color, t, y, xLabel, yLabel }` per
hoverable layer. Note: in `layout: 'lanes'` the reported `y` values are correct,
but the marker's vertical pixel position is approximate (the crosshair is
lane-unaware).

Both crosshair hooks accept an optional **`throttleMs`** (default `0` = update on
every `pointermove`). Set e.g. `throttleMs: 16` to cap crosshair `setState` to
~60fps when many series make per-event re-renders expensive; the `pointerleave`
reset is never throttled.

#### Managed-pool charts: `useBroadcastCrosshairCache`

The crosshair reads from a main-thread `HoverDataCache`. In the **pool fan-out**
path (`pool.broadcastStream` / `host.emitPoolStream`), per-sample data is decoded
inside the worker and never reaches the main thread — so a pooled chart's
crosshair would have nothing to look up. `useBroadcastCrosshairCache` closes that
gap: it returns a stable `cache` plus a `mirror` callback. Call `mirror` with the
same packet + target layer ids **just before** the transfer (the buffer detaches
on transfer), then wire `cache` into the crosshair as usual.

```tsx
const { cache, mirror } = useBroadcastCrosshairCache({ layers });

// in the broadcast tick, BEFORE pool.broadcastStream / emitPoolStream:
mirror(targets.map((t) => t.layerId), new Float32Array(buffer));
pool.broadcastStream(targets, buffer, length);

// crosshair reads the mirrored samples like any other chart:
const { chartRef, state } = useFluxionCrosshair({ host, cache, xMode: 'time', timeWindowMs, timeOrigin });
```

The lower-level `pushPacketToCache(cache, layerIds, packet)` is exported too, if
you manage the cache yourself.

### `<FluxionCrosshair>`

Renders the dashed crosshair lines + a value tooltip from a crosshair `state`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `state` | `CrosshairState` | required | From `useFluxionCrosshair` / `…FromLayers` |
| `lineColor` | `string` | `rgba(255,255,255,0.45)` | Crosshair line color |
| `lineWidth` | `number` | `1` | Crosshair line width |
| `tooltipBg` / `tooltipColor` | `string` | dark / `#e2e8f0` | Tooltip colors |
| `tooltipFontSize` | `number` | `11` | Tooltip font size (px) |
| `style` / `className` | — | — | Applied to the overlay |

### `<FluxionBrush>`

SVG drag-to-select overlay (pair with `useFluxionBrush`), e.g. for range export.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `brushRef` | from `useFluxionBrush` | required | Ref for the overlay |
| `selection` | `BrushSelection \| null` | required | Current selection |
| `width` / `height` | `number` | required | Overlay size (px) |
| `selectionColor` | `string` | `rgba(100,149,237,0.2)` | Selected-region fill |
| `borderColor` | `string` | `#6495ed` | Selection border |

### `<FluxionGauge>`

SVG gauge — arc, ring, or horizontal bar — with color-coded threshold zones.

```tsx
<FluxionGauge value={72} min={0} max={100} type="arc"
  thresholds={[{ value: 0, color: '#26a69a' }, { value: 60, color: '#ffb060' }, { value: 80, color: '#ef5350' }]}
  label="CPU" valueFormat={(v) => `${v.toFixed(0)}%`} />
```

Key props: `value` (required), `min`=0 / `max`=100, `type`=`'arc'|'circle'|'bar'`,
`thresholds`, `size`=120, `showValue`=true, `valueFormat`, `label`.

### `<FluxionPieChart>`

Animated SVG pie / donut chart with optional labels, legend, and center text.

```tsx
<FluxionPieChart
  data={[{ name: 'A', value: 40 }, { name: 'B', value: 35 }, { name: 'C', value: 25 }]}
  innerRadius={40} outerRadius={80} label="percent" legend
/>
```

Key props: `data: { name, value, fill? }[]` (required), `innerRadius`=0 (>0 = donut),
`outerRadius`=80, `paddingAngle`, `label` (`true|'name'|'percent'|'value'|fn`),
`legend`, `centerLabel` / `centerValue`, `animationDuration`=600.

### `<FluxionCanvas>`

Declarative wrapper around `useFluxionCanvas`.

```tsx
import { FluxionCanvas } from '@heojeongbo/fluxion-render/react';

<FluxionCanvas
  layers={[axisGridLayer('axis', { ... }), lineLayer('s1', { ... })]}
  hostOptions={{ bgColor: '#fff', pool }}
  style={{ width: '100%', height: 300 }}
  onReady={(host) => { /* store ref */ }}
/>
```

---

## Vanilla JS API

### `FluxionHost`

```ts
const host = new FluxionHost(canvas, opts?: FluxionHostOptions);

// Layer management
host.addLayer(id, kind, config?)
host.removeLayer(id)
host.configLayer(id, config)
host.configLayers([{ id, config }, …])  // batch many config updates in ONE postMessage
host.setLayerVisibility(id, visible)     // or setLayerVisibility({ [id]: visible }) — one batch
host.clearLayer(id, { latestT? })   // drop ring data; optionally rewind viewport.latestT

// Typed helpers — add layer and return a handle
const line   = host.addLineLayer(id, config?)      // → LineLayerHandle
const static = host.addLineStaticLayer(id, config?) // → LineStaticLayerHandle
const lidar  = host.addLidarLayer(id, config?)      // → LidarLayerHandle

// Attach a handle to an already-added layer
const line = host.line(id)
const lidar = host.lidar(id, stride?)

// Custom worker stream (solo mode only)
host.emitStream(id, buffer, length)  // transfer raw ArrayBuffer to streamHandler

// Canvas
host.resize(width, height, dpr)
host.setBgColor(color)
host.dispose()
```

`host.clearLayer(id, { latestT })` sends an `Op.CLEAR_DATA` message that empties the layer's ring buffer and (optionally) rewinds `viewport.latestT`. This is the worker-side primitive behind replay backfill: the time axis can rewind to a past seek point, and a fresh `pushData` repopulates the visible window.

**All ring-based streaming handles expose `.reset(latestT?)`** as a typed alternative — `LineLayerHandle`, `AreaLayerHandle`, `ScatterLayerHandle`, `StepLayerHandle`, `CandlestickLayerHandle`, `ScatterColoredHandle`, and `PoseArrowHandle`. They all delegate to `host.clearLayer` internally so the worker-side semantics are identical.

Custom layers can opt into `Op.CLEAR_DATA` by implementing the optional `clearData()` method on the `Layer` interface — the built-ins listed above already do.

#### Diagnostics: `getMetrics()` / `onMetricsUpdate()`

`host.getMetrics()` returns a cheap, side-effect-free snapshot of main-thread
activity — useful for perf HUDs and "is data flowing?" checks:

```ts
const m = host.getMetrics();
// { pushCount, sampleCount, bytesTransferred,
//   pushesByLayer: { [id]: count }, lastPushAt, bounds: { yMin, yMax, latestT } | null }
```

For a live feed, `host.onMetricsUpdate(cb, { intervalMs? })` calls `cb` with a
fresh snapshot on an interval (default 250ms). All subscribers share one timer;
it stops when the last unsubscribes (and on `dispose`). Returns an unsubscribe:

```ts
const stop = host.onMetricsUpdate((m) => setHud(m), { intervalMs: 500 });
// …later
stop();
```

### `FluxionWorkerPool`

```ts
const pool = new FluxionWorkerPool({
  size?: number,            // INITIAL worker count, default 4, clamped to [1, 16]
  maxSize?: number,         // upper bound for runtime growth, default = size (growth off).
                            // When > size, the pool starts at size and spawns more workers
                            // on demand (up to maxSize), clamped to [size, 16]
  targetPerWorker?: number, // active hosts/worker that triggers growth, default 12 (min 1).
                            // Only effective when maxSize > size — lower it for heavier
                            // (e.g. high-Hz) per-host workloads to spread sooner
  workerFactory: () => Worker, // required
});

// Pass to FluxionHost — called automatically, you rarely need this directly
pool.acquire() // → FluxionWorkerHandle

pool.hasHost(hostId: string) // → boolean — true if the hostId is registered in this pool
pool.broadcastStream(targets, buffer, length) // send one raw packet to multiple engines

pool.dispose() // terminate all workers
```

---

## Data Format

All data is transferred as `TypedArray` with zero-copy semantics. After calling `pushData` / `push` / `pushRaw`, **do not reuse the buffer** — ownership is transferred to the worker.

| Layer | Format | Stride |
|-------|--------|--------|
| `line` | `[t, y, t, y, ...]` | 2 |
| `line-static` (xy) | `[x, y, x, y, ...]` | 2 |
| `line-static` (y) | `[y0, y1, y2, ...]` | 1 |
| `lidar` stride=2 | `[x, y, x, y, ...]` | 2 |
| `lidar` stride=3 | `[x, y, z, ...]` | 3 |
| `lidar` stride=4 | `[x, y, z, intensity, ...]` | 4 |

For streaming layers, `t` must be **host-relative ms** (`Date.now() - timeOrigin`),
not an absolute epoch. A `Float32` can't hold `Date.now()` without quantizing
sub-second samples onto a single pixel, so pushing an absolute epoch logs a
one-time `console.warn` — tracked **per layer**, so in a multi-chart dashboard one
chart's mistake won't mask the same bug on another layer.

---

## Custom Worker Script (zero-copy stream)

For high-frequency raw sensor data (200Hz+), you can bypass the default `HostMsg` protocol entirely. Write your own worker script that imports `Engine` as a library, decode the raw bytes inside the worker, and push directly into the ring buffer — the main thread never parses anything.

### When to use

- Sensor delivers a custom binary format (packed structs, µs timestamps, raw ADC values)
- You want parsing + ring buffer + OffscreenCanvas draw all in one OS thread
- `postMessage` serialization overhead is measurable at your sample rate

### `"@heojeongbo/fluxion-render/worker"` sub-entry

Exports `Engine`, `Op`, `defineWorker`, `defineWorkerWithState`, and all associated types. Also exports pool-aware message types for custom pool workers:

```ts
import {
  Engine,
  Op,
  defineWorkerWithState,
  type HostMsg,
  type StreamDataMsg,
} from "@heojeongbo/fluxion-render/worker";

// Pool-aware types — used in custom pool worker scripts
import type {
  FluxionPoolStreamMsg,
  PoolInitMsg,
  PoolDisposeMsg,
} from "@heojeongbo/fluxion-render/worker";
```

### Worker script

```ts
// my-sensor-worker.ts
import {
  Engine, Op, defineWorkerWithState,
  type HostMsg, type StreamDataMsg,
} from "@heojeongbo/fluxion-render/worker";

// Wire format per sample: [timestamp_us: f32, raw_i16: f32]
// Decode: us→ms, raw/32767 → [-1, 1]
defineWorkerWithState<HostMsg, object, Engine, StreamDataMsg>(
  // rpcHandler — receives INIT / ADD_LAYER / RESIZE / DISPOSE
  (msg, _reply, ctx) => {
    const engine = ctx.state ?? new Engine();
    engine.dispatch(msg as HostMsg);
    if ((msg as HostMsg).op === Op.DISPOSE) return null;
    return engine;
  },
  // streamHandler — receives raw ArrayBuffer transferred from main thread
  (msg, _push, ctx) => {
    const engine = ctx.state;
    if (!engine) return;

    const sampleCount = msg.length >> 1;
    const raw = new Float32Array(msg.buffer, 0, msg.length);
    const decoded = new Float32Array(sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
      decoded[i * 2]     = raw[i * 2]! / 1000;         // µs → ms
      decoded[i * 2 + 1] = raw[i * 2 + 1]! / 32767;   // raw → [-1, 1]
    }
    engine.pushRaw(msg.id, decoded);
  },
);
```

### Main thread

```ts
const host = new FluxionHost(canvas, {
  workerFactory: () =>
    new Worker(new URL("./my-sensor-worker.ts", import.meta.url), { type: "module" }),
});

host.addLayer("sensor", "line", { color: "#4fc3f7", capacity: 2048 });

// High-frequency loop — main thread only packs raw bytes, never parses
const dtMs = 1000 / 200;
setInterval(() => {
  const buf = new Float32Array(2);
  buf[0] = Date.now() * 1000;   // ms → µs
  buf[1] = readADC() * 32767;   // normalize to raw i16 range

  // Transfer ownership — buf.buffer is detached after this call
  host.emitStream("sensor", buf.buffer, buf.length);
}, dtMs);
```

**`host.emitStream(id, buffer, length)`** — transfers `buffer` to the worker's `streamHandler`. After the call, `buffer` is detached and must not be read. Only meaningful when `workerFactory` is set (solo mode). For pool mode, use `pool.broadcastStream()` described below.

---

### Pool fan-out stream (1 worker, N canvases, 1 decode)

When one pool worker serves many canvases, send a single encoded packet and decode it **once** in the worker — not once per canvas. This is the most efficient pattern for high-frequency multi-channel sensor data.

**How it works:**
1. Create a `size: 1` pool with a pool-aware custom worker
2. Pass the pool to every `<FluxionCanvas>` via `hostOptions={{ pool }}`
3. In `onReady`, capture each `host.hostId` (unique Engine ID in the worker)
4. Call `pool.broadcastStream(targets, buffer, length)` — groups targets by worker, one transfer per worker

**Pool-aware worker script:**

```ts
import { Engine, Op } from "@heojeongbo/fluxion-render/worker";
import type {
  FluxionPoolStreamMsg, HostMsg, PoolInitMsg, PoolDisposeMsg,
} from "@heojeongbo/fluxion-render/worker";

const engines = new Map<string, Engine>();

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as HostMsg | FluxionPoolStreamMsg | { mode?: string };

  if ("op" in msg && msg.op === Op.POOL_INIT) {
    const m = msg as PoolInitMsg;
    const engine = new Engine();
    engines.set(m.hostId, engine);
    engine.dispatch({ op: Op.INIT, canvas: m.canvas, width: m.width,
                      height: m.height, dpr: m.dpr, bgColor: m.bgColor, hostId: m.hostId });
    return;
  }

  if ("op" in msg && msg.op === Op.POOL_DISPOSE) {
    const m = msg as PoolDisposeMsg;
    engines.get(m.hostId)?.dispatch({ op: Op.DISPOSE });
    engines.delete(m.hostId);
    return;
  }

  if ((msg as { mode?: string }).mode === "pool-stream") {
    const s = msg as FluxionPoolStreamMsg;
    const raw = new Float32Array(s.buffer, 0, s.length);
    // Wire format: Float32[1 + N]
    //   raw[0]       = timestamp_us
    //   raw[1 + ci]  = ch_ci raw_i16 (ADC value in [-32767, 32767])
    // targets[ci] corresponds to raw[1 + ci] — same ordering guaranteed by main thread
    const t_ms = raw[0]! / 1000; // µs → ms
    for (let ci = 0; ci < s.targets.length; ci++) {
      const { hostId, layerId } = s.targets[ci]!;
      const decoded = new Float32Array(2);
      decoded[0] = t_ms;
      decoded[1] = raw[1 + ci]! / 32767; // raw → [-1, 1]
      engines.get(hostId)?.pushRaw(layerId, decoded);
    }
    return;
  }

  // Standard HostMsg — route by hostId
  const hostMsg = msg as HostMsg & { hostId?: string };
  engines.get(hostMsg.hostId ?? "__solo__")?.dispatch(hostMsg);
};
```

**Main thread (React):**

```tsx
import { useTimeOrigin, useFluxionWorkerPool, FluxionCanvas } from '@heojeongbo/fluxion-render/react';

const pool = useFluxionWorkerPool({
  size: 1,
  workerFactory: () =>
    new Worker(new URL("./my-pool-worker.ts", import.meta.url), { type: "module" }),
});

const timeOrigin = useTimeOrigin();
const hostsRef = useRef<(FluxionHost | null)[]>(Array.from({ length: N }, () => null));

// In each chart's onReady — filter stale hosts from prev pool (React StrictMode safe):
<FluxionCanvas
  hostOptions={{ pool }}
  onReady={(host) => { hostsRef.current[i] = host; }}
  ...
/>

// Send loop — build one raw packet, one broadcastStream call, worker decodes all channels
useEffect(() => {
  const id = setInterval(() => {
    // Only include hosts registered in the current pool
    const targets = hostsRef.current
      .map((host, i) => host && pool.hasHost(host.hostId)
        ? { hostId: host.hostId, layerId: "sensor", idx: i }
        : null)
      .filter(Boolean) as { hostId: string; layerId: string; idx: number }[];

    if (targets.length === 0) return;

    const tMs = Date.now() - timeOrigin;
    const buf = new Float32Array(1 + targets.length);
    buf[0] = tMs * 1000; // ms → µs
    for (let ci = 0; ci < targets.length; ci++) {
      buf[1 + ci] = readChannel(targets[ci]!.idx) * 32767; // raw i16 range
    }

    // targets[ci] ↔ buf[1+ci] — same loop, same order
    pool.broadcastStream(
      targets.map(({ hostId, layerId }) => ({ hostId, layerId })),
      buf.buffer,
      buf.length,
    );
  }, 1000 / 120);
  return () => clearInterval(id);
}, [pool, timeOrigin]);
```

**`pool.broadcastStream(targets, buffer, length)`** — groups `targets` by worker and sends one `pool-stream` message per worker. With `size: 1`, the original `buffer` is transferred (zero-copy, no copies). With `size > 1`, all but the last worker receive a `buffer.slice(0)` copy.

**`host.hostId`** — the unique ID that identifies this host's Engine inside the worker. Use it to build the `targets` array for `broadcastStream`.

---

## Architecture

```
Main Thread                          Worker Thread(s)
───────────────                      ─────────────────
FluxionHost                          FluxionWorkerPool
  │                                    │
  │──POOL_INIT (OffscreenCanvas)──────►│  Engine (per host)
  │──ADD_LAYER ──────────────────────►│    LayerStack
  │──DATA (Float32Array transfer) ───►│      LineChartLayer
  │──emitStream (ArrayBuffer) ────────►│      streamHandler → pushRaw()
  │──broadcastStream (pool-stream) ───►│  Engine × N  (decode once, fan-out)
  │──RESIZE ──────────────────────────►│      LidarScatterLayer
  │──DISPOSE ─────────────────────────►│      AxisGridLayer
                                       │
                                       │  Scheduler (rAF)
                                       │    scan pass → draw pass
                                       │    OffscreenCanvas → screen
```

- Workers are never blocked by main-thread layout or JS execution
- `ArrayBuffer` is transferred (not copied) on every `pushData` call
- The Scheduler only renders when data changes (`markDirty()`)
- Multiple engines share one worker via `hostId` routing
- `pool.broadcastStream()` with `size: 1` decodes once and fans out to N engines — ideal for multi-channel sensor dashboards

---

## `/testing` sub-path

Deterministic signal generators + PRNG helpers used by the demos, exported from a sub-path so they don't bloat the production bundle:

```ts
import {
  mulberry32,
  createSineSynth,
  createLinearRamp,
} from '@heojeongbo/fluxion-render/testing';

const rand = mulberry32(42);           // deterministic [0, 1) PRNG
const sine = createSineSynth({ freqHz: 0.5, amplitude: 0.8 });
sine(performance.now());                // multi-harmonic sine + drift + noise

const ramp = createLinearRamp({ slope: 0.5, baseT: Date.now() });
ramp(Date.now() + 1000);                // 0.5 — perfect "is data flowing?" smoke signal
```

Use these to drive integration tests, Storybook stories, or your own demos with the same fixtures the monorepo's demos use.

---

## Testing

Tested with [Vitest](https://vitest.dev) (happy-dom) and a fake OffscreenCanvas.
Coverage runs on the v8 provider:

```bash
pnpm --filter @heojeongbo/fluxion-render build   # workspace deps resolve via dist
cd packages/fluxion-render && pnpm vitest run --coverage
```

Enforced thresholds (`vitest.config.ts`): **100% statements / functions / lines**;
branches **98%**. The branch shortfall is entirely v8's phantom "implicit-else"
branch on every `if` without an `else` (reported with no source location, so it
can't be tested or ignored) — every reachable branch is covered or carries a
documented `/* v8 ignore … */`. The coverage badge above is static; the real
guarantee is the threshold gate, which fails CI if coverage regresses.

---

## License

MIT
