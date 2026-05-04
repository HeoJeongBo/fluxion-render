# @heojeongbo/fluxion-render

High-performance OffscreenCanvas rendering engine for real-time data visualization.

Built for robotics and sensor systems: streaming line charts, LiDAR point clouds, and high-frequency data pipelines up to 120Hz+. Rendering runs entirely in Web Workers — the main thread is never blocked.

```
npm install @heojeongbo/fluxion-render
```

---

## Features

- **Worker Pool** — 60 charts share 4 workers by default. Zero config required.
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
} from '@heojeongbo/fluxion-render/react';

function Chart() {
  const timeOrigin = useMemo(() => Date.now(), []);

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

Every `FluxionHost` automatically uses a shared module-level pool of **4 workers** — no setup needed. Mounting 60 charts creates 60 hosts but only 4 OS threads.

```tsx
// No config — 4 workers shared automatically
<FluxionCanvas layers={[...]} />
<FluxionCanvas layers={[...]} />
// ... 60 of these all share the same 4 workers
```

**Adjust pool size** (call before creating any host):

```ts
import { configureDefaultPool } from '@heojeongbo/fluxion-render';

configureDefaultPool({ size: 2 }); // use 2 workers instead of 4
```

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
})
```

`retentionMs` + `maxHz` auto-calculate `capacity = ceil(retentionMs/1000 * maxHz * 1.1)`.  
Explicit `capacity` always takes priority when both are set.

**Toggling series visibility** — use `visible` with `useLayerConfig` to show/hide a layer without reinitialising the host or losing buffered data:

```tsx
const [enabled, setEnabled] = useState({ s1: true, s2: true, s3: false });

// layers is fixed on mount — never recreated on toggle
const layers = useMemo(() => [
  axisGridLayer('axis', { ... }),
  lineLayer('s1', { color: '#4fc3f7' }),
  lineLayer('s2', { color: '#80ffa0' }),
  lineLayer('s3', { color: '#ffb060' }),
], []);

// only a lightweight CONFIG message is sent to the worker on each toggle
useLayerConfig(host, lineLayer('s1', { visible: enabled.s1 }));
useLayerConfig(host, lineLayer('s2', { visible: enabled.s2 }));
useLayerConfig(host, lineLayer('s3', { visible: enabled.s3 }));
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

### `axis-grid` — Axes and grid

Controls the viewport bounds for all layers. Does not receive data — configure via `axisGridLayer()` or `host.configLayer()`.

```ts
axisGridLayer('axis', {
  // X axis
  xMode?: 'fixed' | 'time',   // 'fixed': static range, 'time': sliding window
  xRange?: [min, max],        // xMode: 'fixed' only
  timeWindowMs?: number,      // xMode: 'time' only
  timeOrigin?: number,        // Date.now() at stream start (for clock labels)
  xTickFormat?: string | ((v: number) => string), // format string or custom formatter

  // Y axis
  yMode?: 'fixed' | 'auto',   // 'auto': fits to visible data
  yRange?: [min, max],        // yMode: 'fixed' only
  yAutoPadding?: number,      // fractional padding for auto mode (default 0.1)

  // Appearance
  gridColor?: string,
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

---

## React API

### `useFluxionCanvas(options)`

Creates the canvas, worker, and all layers. Returns a ref to attach to a container `<div>` and the `FluxionHost` instance.

```ts
const { containerRef, host } = useFluxionCanvas({
  layers: FluxionLayerSpec[],       // layer declarations
  hostOptions?: FluxionHostOptions, // bgColor, pool, workerFactory
  onReady?: (host) => void,         // called once after initialization
});
```

### `useFluxionStream(options)`

Drives a data loop via `setInterval`. Returns a measured sample rate.

```ts
const { rate } = useFluxionStream({
  host,                   // from useFluxionCanvas
  intervalMs: number,     // e.g. 1000/60 for 60Hz
  setup: (host) => T,     // called once — resolve typed handles here
  tick: (tMs, state) => number, // called every interval, return sample count
});
```

`tMs` is milliseconds since the first tick (not `Date.now()`). Use it as the `t` value for line samples.

### `useFluxionWorkerPool(options)`

Creates a scoped `FluxionWorkerPool` that is disposed when the component unmounts.

```ts
const pool = useFluxionWorkerPool({
  size?: number,              // default 4
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
| `columns` | `FluxionTableColumn<R>[]` | `{ key, header, render? }` — `render` receives `(value, row)` |
| `rows` | `R[]` | Row data objects |
| `classNames` | `FluxionTableClassNames` | Per-element CSS class names. All optional |
| `style` | `CSSProperties` | Applied to the root wrapper `<div>` |

No default styles are applied — layout and appearance are fully controlled via `classNames`.

### `useLayerConfig(host, layerSpec)`

Reactively updates a layer's config when the spec changes.

```ts
const [windowMs, setWindowMs] = useState(5000);
useLayerConfig(host, axisGridLayer('axis', { timeWindowMs: windowMs }));
```

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

// Typed helpers — add layer and return a handle
const line   = host.addLineLayer(id, config?)      // → LineLayerHandle
const static = host.addLineStaticLayer(id, config?) // → LineStaticLayerHandle
const lidar  = host.addLidarLayer(id, config?)      // → LidarLayerHandle

// Attach a handle to an already-added layer
const line = host.line(id)
const lidar = host.lidar(id, stride?)

// Canvas
host.resize(width, height, dpr)
host.setBgColor(color)
host.dispose()
```

### `FluxionWorkerPool`

```ts
const pool = new FluxionWorkerPool({
  size?: number,           // default 4, clamped to [1, 16]
  workerFactory: () => Worker, // required
});

// Pass to FluxionHost — called automatically, you rarely need this directly
pool.acquire() // → FluxionWorkerHandle

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

---

## License

MIT
