# Changelog

## [0.11.1](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.11.0...fluxion-replay-v0.11.1) (2026-06-08)


### Bug Fixes

* **replay:** fix bugs, improve perf, and expand test coverage ([844c71a](https://github-personal/HeoJeongBo/fluxion-render/commit/844c71ac933330abbbfd224520efc18d0f8a0f7e))

# [0.11.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.10.0...fluxion-replay-v0.11.0) (2026-06-05)


### Features

* **replay,render,examples:** DVR scrub perf + entry fix, draw decimation, coverage ([b120d61](https://github-personal/HeoJeongBo/fluxion-render/commit/b120d61f678024f7ff685dcf565f4e2ef694ddb4)), closes [hi#rate](https://github-personal/hi/issues/rate)

# [0.10.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.9.0...fluxion-replay-v0.10.0) (2026-06-04)


### Features

* **replay,examples:** add DVR controller/format/producer hooks, fix video seek, tailwind demo ([d23d31c](https://github-personal/HeoJeongBo/fluxion-render/commit/d23d31cef7237fb2f5eb9386d73677245a09394f))

# [0.9.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.8.0...fluxion-replay-v0.9.0) (2026-06-02)


### Bug Fixes

* **replay:** remove dead pendingGetTimeRangeResolvers causing TS2339 type error ([c4241cc](https://github-personal/HeoJeongBo/fluxion-render/commit/c4241cc596ece5e23a133b214986e6b6cec37dab))


### Features

* **replay,examples:** fix dvr re-entry/freeze bugs, add useScrubberControls and DvrScrubber ([b1c87f7](https://github-personal/HeoJeongBo/fluxion-render/commit/b1c87f78d3137a5699793da9d5964cc67760ab7d))

## [Unreleased]

### Fixed

- **Prefetch boundary duplicate frames** — `ReplayStore.getFrames` now accepts a `lowerOpen` parameter (exclusive lower bound via `IDBKeyRange`). Previously, adjacent prefetch windows shared the same boundary timestamp, causing a frame to be fetched and emitted twice. ([`replay-store.ts`](src/features/store/model/replay-store.ts), [`replay-player.ts`](src/features/player/model/replay-player.ts))

- **Second time-travel fails after auto-exit** — After `autoExitToLive` fires, `liveTimeRange` can still hold the previous `frozenLatest` for up to 500 ms (poll interval). A second `dvr.enter()` in that window would create a player bounded to the old range, silently skipping data recorded since the first DVR exit. Fixed by caching the recorder's in-memory latest at exit time (`postExitIdbLatestRef`) and detecting staleness before calling `enterReplay`. ([`use-replay-dvr.ts`](src/widgets/dvr/lib/use-replay-dvr.ts))

- **Chrome freeze / unresponsive UI under high frame rates** — Three changes to `ReplayStore` reduce main-thread blocking when recording many channels at high Hz (e.g. 16 ch × 60 Hz = 960 frames/s): (1) `MAX_BATCH_SIZE = 200` caps the number of `store.add()` calls per IDB transaction; excess frames stay in the pending queue for the next interval tick. (2) `EVICT_EVERY_N_FLUSHES = 10` runs eviction only once every 10 timer-driven flushes instead of after every flush. (3) `MAX_DELETE_PER_EVICTION = 500` limits the cursor-delete loop to 500 records per pass, preventing multi-second stalls when tens of thousands of old frames need eviction. The public `flush()` method still drains the entire pending queue and runs eviction once. ([`replay-store.ts`](src/features/store/model/replay-store.ts))

- **Chart "jump" on DVR→live transition** — When returning to live mode, `useChartLiveBackfill` synchronously resets the chart and then queries IDB asynchronously. During that window (1–50 ms) the live pump could push a single latest sample before the full backfill window arrived, producing a visible jump. Fixed by exposing `isBackfilling: boolean` from `useChartLiveBackfill` and suppressing `handle.push()` calls in `useChartReplayBridge` while the backfill is in flight. ([`use-chart-live-backfill.ts`](src/widgets/chart-replay/lib/use-chart-live-backfill.ts), [`use-chart-replay-bridge.ts`](src/widgets/chart-replay/lib/use-chart-replay-bridge.ts))

### Added

- **`useScrubberControls`** — New hook that encapsulates the drag-preview → release-commit state machine DVR scrubbers need. Returns `{ scrubT, onScrubChange, commitScrub }`. Handles five transitions: live→DVR speculative enter, live micro-drag no-op, commit live→DVR enter+play, commit DVR→live exit, commit DVR mid-seek+play. Pair with `useReplayScrubber` for the `min`/`max`/`value` bounds. ([`use-scrubber-controls.ts`](src/widgets/replay-timeline/lib/use-scrubber-controls.ts))

- **`<DvrScrubber />`** — New component: `<input type="range">` with left/centre/right timestamp labels and live-vs-DVR colour theming. Accepts `liveAccentColor`, `dvrAccentColor`, `dvrTextColor`, `labelColor`, `liveBadgeText`, `formatTime`, and a `style` override for the container div. Wire directly from `useReplayScrubber` + `useScrubberControls`. ([`dvr-scrubber.tsx`](src/widgets/replay-timeline/ui/dvr-scrubber.tsx))

- **`useChartLiveBackfill` now returns `{ isBackfilling }`** — Previously returned `void`. The boolean is `true` while the async IDB query is in-flight and lets callers suppress live chart pushes during that window. ([`use-chart-live-backfill.ts`](src/widgets/chart-replay/lib/use-chart-live-backfill.ts))

- **Worker fan-out replay demo** — New tab in `fluxion-replay-demo`: combines `pool.broadcastStream()` (1 worker, 16 charts) with full DVR recording and playback. Demonstrates recording at the JS tick level before broadcasting, so the replay store captures data without decoding the Float32 wire format. ([`examples/fluxion-replay-demo/src/worker-fan-out.tsx`](../../examples/fluxion-replay-demo/src/worker-fan-out.tsx))

- **Scenario 06: multi-chart fan-out** — 10 test cases verifying that a single `ReplayPlayer` fans out correctly to N independent typed `onFrame` listeners: storage, fan-out, channel isolation, timestamp synchronization, seek, frame ordering, `onEnd`, listener cleanup, sparse channel, and mid-playback partial unsubscribe. ([`06-multi-chart-fan-out.test.ts`](src/scenarios/06-multi-chart-fan-out.test.ts))

- **`useScrubberControls` test suite** — 16 test cases covering all five mode transitions, custom `liveEdgeEpsMs`, rate forwarding, and null-scrubT no-op. ([`use-scrubber-controls.test.ts`](src/widgets/replay-timeline/lib/use-scrubber-controls.test.ts))

### Changed

- **`makeFakeSession`** (`chart-replay-fixtures.tsx`) — Accepts a new `timeRange?` option; exposes a `getTimeRange()` mock that returns it. Required by `useReplayDvr.enter()`, which now reads the current IDB range directly from the session to detect a stale `liveTimeRange` after DVR auto-exit.

- **`makeFakePlayer`** (`chart-replay-fixtures.tsx`) — Added `seek: vi.fn()` so tests can assert on DVR mid-seek calls without wiring a real `ReplayPlayer`.

- **`useReplayDvr` dependency array** — `enter()` callback no longer lists `liveTimeRange` as a dep (read via `liveTimeRangeRef` instead), preventing callback recreation on every 500 ms poll tick.

- **Demo refactor** — `chart-replay.tsx` and `worker-fan-out.tsx` replace their ~50-line inline scrubber blocks with `useScrubberControls` + `<DvrScrubber />`.

---

# [0.8.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.7.2...fluxion-replay-v0.8.0) (2026-06-02)


### Bug Fixes

* **render,worker:** fix "WorkerPool has been disposed" in React StrictMode ([75bd076](https://github-personal/HeoJeongBo/fluxion-render/commit/75bd0762f3d66a52dc1150108a63420c1e78a1da))


### Features

* **render,examples:** add yAutoMinSpan to axis-grid and Friday 0x0001 packet demo ([57de13a](https://github-personal/HeoJeongBo/fluxion-render/commit/57de13aaef63f4c331768021b3ed69b57340442b))
* **render,worker,examples:** add custom worker stream pattern and stream mode ([952aba3](https://github-personal/HeoJeongBo/fluxion-render/commit/952aba389ced294b4ff488dfcef02c73e7589b07))
* **render,worker,examples:** add pool-level fan-out stream API ([6342d1b](https://github-personal/HeoJeongBo/fluxion-render/commit/6342d1b564533e7334626884fcbbe8b04936269e))
* **render:** add useTimeOrigin, extend useSyncedTimeWindow with timeOrigin, fix broadcastStream grouping ([75f163f](https://github-personal/HeoJeongBo/fluxion-render/commit/75f163fb52aa41709717e7820535e61065751496))
* **replay,examples:** add worker fan-out replay demo and fix prefetch boundary duplicate ([99d290e](https://github-personal/HeoJeongBo/fluxion-render/commit/99d290e4c3233b000c18e3e2ff17485e4fb5cbfc))


### Reverts

* **examples:** remove Friday packet demo and restore pool fan-out stream demo ([b50a308](https://github-personal/HeoJeongBo/fluxion-render/commit/b50a308eed99c882d4ca34565b0eead9870d684d))

## [0.7.2](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.7.1...fluxion-replay-v0.7.2) (2026-06-01)

## [0.7.1](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.7.0...fluxion-replay-v0.7.1) (2026-05-27)


### Features

* **replay:** maximize test coverage and add chart replay perf optimizations ([cadb2eb](https://github-personal/HeoJeongBo/fluxion-render/commit/cadb2eb0506b4e4910d673859c620dbdbdde9f29))

# [0.7.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.5.0...fluxion-replay-v0.7.0) (2026-05-26)


### Bug Fixes

* **replay:** correct test array type annotation in dvr-metric-buffer.test.ts ([586d5ac](https://github-personal/HeoJeongBo/fluxion-render/commit/586d5ac121b1565f8a9808c12bb597a8189e854d))
* **replay:** suppress React act() teardown race and upgrade vitest to 4.1.7 ([322baab](https://github-personal/HeoJeongBo/fluxion-render/commit/322baab0102ad308caeb296ef54f0e9101dd6c07))


### Features

* **replay,examples:** add auto-eviction, storage logging, and user scenario tests ([1a9e862](https://github-personal/HeoJeongBo/fluxion-render/commit/1a9e8620b5f479e7dcbb2d74be16e5983cb53f4e))

* chore: release @heojeongbo/fluxion-render v0.10.0 (48cbe4e)
* feat(render,replay,examples): DX overhaul + bridge hook + testing utils (48e5185)

# [0.4.0](https://github.com/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.3.0...fluxion-replay-v0.4.0) (2026-05-24)


### Features

* **render,replay,examples:** add useChartReplay for time-travel line charts ([6993fa9](https://github.com/HeoJeongBo/fluxion-render/commit/6993fa9f2cdec01783e54a61569c2810a748ba10))
* **replay,examples,render:** chart-replay DVR with scrub-then-play UX ([98e4544](https://github.com/HeoJeongBo/fluxion-render/commit/98e45444567349ec36049d13e6212c9f5546bd16))

# [0.3.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.2.1...fluxion-replay-v0.3.0) (2026-05-22)


### Bug Fixes

* **examples:** auto-play on DVR entry and fix scrubber drag-lock ([8a8b30e](https://github-personal/HeoJeongBo/fluxion-render/commit/8a8b30ef6b153c3fa2523dfc0a46be5fe3cd91d0))
* **examples:** freeze timeline latest on DVR entry for correct scrubber behavior ([bd2e7ec](https://github-personal/HeoJeongBo/fluxion-render/commit/bd2e7ec2c51f21053c2d64ebe5087f1389d95789))
* **examples:** move storage capacity bar above timeline scrubber ([c1c8c1c](https://github-personal/HeoJeongBo/fluxion-render/commit/c1c8c1c4af74412c8b243288a906b880c03f231b))
* **examples:** snap scrubber to next segment on gap and fix DVR page overflow ([e6fd8de](https://github-personal/HeoJeongBo/fluxion-render/commit/e6fd8deabca1e9c9c876001bcce8e0582da6686c))
* **replay,examples:** fix VP8 decoder dimension mismatch on Retina displays ([79b2b32](https://github-personal/HeoJeongBo/fluxion-render/commit/79b2b3297275dd4d75fbaea12b517c9a68678636))
* **replay,examples:** revert seenKeyframe guard and fix timeline overflow ([6908302](https://github-personal/HeoJeongBo/fluxion-render/commit/69083025f9bf185c76b2f97aa3170e563769f9a4))
* **replay:** add codedWidth/codedHeight to VideoChannel round-trip tests ([fd279c2](https://github-personal/HeoJeongBo/fluxion-render/commit/fd279c29dd192e178cc641b924b0550f982364a1))
* **replay:** extend seek lookback to 3s to guarantee keyframe before decode ([3427a49](https://github-personal/HeoJeongBo/fluxion-render/commit/3427a4938f6a3708519767a927e9cace4c81a213))


### Features

* **examples:** auto-return to live when replay reaches the live edge ([82521b2](https://github-personal/HeoJeongBo/fluxion-render/commit/82521b2fbd96eff2c972176fc88671168af3da70))
* **replay,examples:** add DVR time-travel demo and extend useReplayTimeline ([e7f089f](https://github-personal/HeoJeongBo/fluxion-render/commit/e7f089ff4ee0ed9e8113bba05eefe75bfe03f5da))
* **replay,examples:** add perf fixes, DX improvements, storage API, and new hooks ([f43ac1c](https://github-personal/HeoJeongBo/fluxion-render/commit/f43ac1c5c59dad150705515502d6998a93d30465))
* **replay,examples:** recording segments, gap visualization, and video fix ([29bd089](https://github-personal/HeoJeongBo/fluxion-render/commit/29bd089fc67256bde3da13f217c62f35620ea0d3))

## [0.2.1](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-replay-v0.2.0...fluxion-replay-v0.2.1) (2026-05-21)

# [0.2.0](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.5.0...fluxion-replay-v0.2.0) (2026-05-21)


### Bug Fixes

* monorepo publish ([18304eb](https://github-personal/HeoJeongBo/fluxion-render/commit/18304eb4adc29f2fd37e4facda51eada72ae352e))
* npm publish warn issue ([00fcd91](https://github-personal/HeoJeongBo/fluxion-render/commit/00fcd91648443d77e64cc65ff2a453ca33e004ce))
* publish setting ([89a7097](https://github-personal/HeoJeongBo/fluxion-render/commit/89a70970c049e95ffef08470e80072b9cdc80f9d))
* registry setting ([4e956e6](https://github-personal/HeoJeongBo/fluxion-render/commit/4e956e643024759b1565705fad545fa8aa73bd63))
* release-it ([b2507c3](https://github-personal/HeoJeongBo/fluxion-render/commit/b2507c3541e4d9cc3464f3b087d2dac38496f14b))
* **worker:** abort pending requests on pool-backed dispose, remove handle from set on release ([e3576a6](https://github-personal/HeoJeongBo/fluxion-render/commit/e3576a63942b52d3fac869eaaedc89527cc534bb))


### Features

* add fluxion worker package ([b74be40](https://github-personal/HeoJeongBo/fluxion-render/commit/b74be4021d3bec77c760bf2b664ec09a31f0b45a))
* add standalone onMessage ([c586841](https://github-personal/HeoJeongBo/fluxion-render/commit/c58684100a07006547dd48a625e949cd8f0b1bf1))
* **render,examples:** add area, step, bar, candlestick, heatmap chart layers ([3ec63bd](https://github-personal/HeoJeongBo/fluxion-render/commit/3ec63bd70ae625e1cbcab056fafb43c618f215c6))
* **render,examples:** add crosshair + tooltip hover interaction ([eb2e4db](https://github-personal/HeoJeongBo/fluxion-render/commit/eb2e4dba1df2a8f45add0f2bd759a258e2d747a3))
* **render,examples:** add FluxionPieChart and classNames CSS injection support ([96f1c77](https://github-personal/HeoJeongBo/fluxion-render/commit/96f1c771bd6d9de361d89011dbd02e4aeaf83027))
* **render,examples:** add pie chart enter/update animations and fix StrictMode bug ([cb19933](https://github-personal/HeoJeongBo/fluxion-render/commit/cb19933110dcd62496eb0c49648b1d79cfb69e1a))
* **render,examples:** add reference-line and pose-arrow layers ([7a0cc92](https://github-personal/HeoJeongBo/fluxion-render/commit/7a0cc92ae4784e19e31ab5bbd1fc406c8a2dd6b6))
* **render,examples:** add robot visualization layers and demo dashboard ([438aca2](https://github-personal/HeoJeongBo/fluxion-render/commit/438aca2a3432276f1d0ba5dbd73b88faa2a7fd30))
* **render,examples:** add streaming scatter chart layer ([afdab3a](https://github-personal/HeoJeongBo/fluxion-render/commit/afdab3ae89996948ce7acd3ad440e7e81abd9ab2))
* **render,examples:** dx improvements — factory fn exports, FluxionCanvas cleanup, null-host warning ([40d7ac6](https://github-personal/HeoJeongBo/fluxion-render/commit/40d7ac6ab77fb3eb09ff42dd1f322be76e0fde67))
* **replay,examples:** add @heojeongbo/fluxion-replay package with demo ([516aa01](https://github-personal/HeoJeongBo/fluxion-render/commit/516aa0192d8fc6912302d5f20ca0f9bbb5cf4a69))
* update md ([d7e49db](https://github-personal/HeoJeongBo/fluxion-render/commit/d7e49dbd217c44e3e7dfa9f405aad5538436eb39))
* worker publish setting ([6ed8ef1](https://github-personal/HeoJeongBo/fluxion-render/commit/6ed8ef18fdcc3f5884aef7871ff8423ca3b6f823))
* **worker,examples:** add /react subpath with hooks and React Hooks demo tab ([ff9f04a](https://github-personal/HeoJeongBo/fluxion-render/commit/ff9f04a14bde8eb5b0c8735378d1ecb491a3085b))
* **worker,examples:** add dispatch, dispose, WorkerTimeoutError.is ([4afcf1d](https://github-personal/HeoJeongBo/fluxion-render/commit/4afcf1dd45e092ec9592d88e2aaa973124586626))
* **worker,examples:** add request, stats, onError, defineWorkerWithState ([239db37](https://github-personal/HeoJeongBo/fluxion-render/commit/239db37768d606b078878eae6c8a9305a0f00267))
* **worker:** add isTerminated getter, strip hostId from onMessage, fix WorkerLike, safe subclass override ([e8508c4](https://github-personal/HeoJeongBo/fluxion-render/commit/e8508c4fb18f0fa5e0aab9a2925ffbb52668c85e))
* **worker:** preserve worker stack, harden dispose race, immutable postMessage ([c547afe](https://github-personal/HeoJeongBo/fluxion-render/commit/c547afec63be6ce0c359c2452480bb5f4569c0e0))

# 0.5.0 (2026-04-24)


### Bug Fixes

* minor performance issue ([5af3285](https://github-personal/HeoJeongBo/fluxion-render/commit/5af3285fbe89514ca0699e4094dc942b8cf21577))


### Features

* axis to worker ([b3abe11](https://github-personal/HeoJeongBo/fluxion-render/commit/b3abe11e4c6f4b2bc4ac46f4f2f775ab6e56f395))

## 0.4.1 (2026-04-21)


### Bug Fixes

* xAxis performance issue ([fb96608](https://github-personal/HeoJeongBo/fluxion-render/commit/fb96608e8864db3d9e16713cf863e12c2151e9a5))
* xAxis tick test ([bf93bf2](https://github-personal/HeoJeongBo/fluxion-render/commit/bf93bf2bbd98205b51486231b8e0b0dde8750961))

# 0.4.0 (2026-04-21)


### Bug Fixes

* type issue ([61ad0db](https://github-personal/HeoJeongBo/fluxion-render/commit/61ad0dbc5dba7af6dc05e0d13b6c2a041d98f822))


### Features

* add fluxion table ([93d94be](https://github-personal/HeoJeongBo/fluxion-render/commit/93d94be093b20b2f415f5cabb6bde2c54b9f88b1))

## 0.3.6 (2026-04-21)


### Features

* minor updates ([ae039ba](https://github-personal/HeoJeongBo/fluxion-render/commit/ae039ba69b67903758626a16c8760c80f48ce163))

## 0.3.5 (2026-04-21)


### Features

* add line filter ([93fe677](https://github-personal/HeoJeongBo/fluxion-render/commit/93fe677a8fb670097088df902f39c01f887f94a7))

## 0.3.4 (2026-04-21)


### Features

* add retention ms & historical ([2017777](https://github-personal/HeoJeongBo/fluxion-render/commit/2017777342e0a561f810878b1f0898d3037fcc03))

## 0.3.3 (2026-04-21)


### Bug Fixes

* xAxis performance issue ([8a1af5a](https://github-personal/HeoJeongBo/fluxion-render/commit/8a1af5ab93439af7f84d2a458f1c0a5b77ea57bd))

## 0.3.2 (2026-04-20)


### Features

* external axes performance ([0e7dc6b](https://github-personal/HeoJeongBo/fluxion-render/commit/0e7dc6b550441a35e9df409b69cbc64fe031a11e))

## 0.3.1 (2026-04-18)


### Features

* recharts style ([d91b7dc](https://github-personal/HeoJeongBo/fluxion-render/commit/d91b7dc93dcf54603da8728b4ddd6f0bf7a2a094))

# 0.3.0 (2026-04-17)


### Features

* add external axis ([5c21bc6](https://github-personal/HeoJeongBo/fluxion-render/commit/5c21bc68c71dab64e6e39d0f2962ceae86d99a42))

## 0.2.4 (2026-04-16)


### Features

* debounce on resize ([7e660ce](https://github-personal/HeoJeongBo/fluxion-render/commit/7e660cee2671a859c0fed401e86843f30a8d5b36))

## 0.2.3 (2026-04-16)


### Features

* update md ([d825cb6](https://github-personal/HeoJeongBo/fluxion-render/commit/d825cb608c8d657e16a064ad247c4eb7a4640329))

## 0.2.2 (2026-04-16)


### Features

* add worker pool ([b84c72a](https://github-personal/HeoJeongBo/fluxion-render/commit/b84c72ae1431674e7320114098d1da89119884cd))

## 0.2.1 (2026-04-11)


### Features

* color set option ([792bd66](https://github-personal/HeoJeongBo/fluxion-render/commit/792bd66ff860f50877c6404c458a2ff79f2ac4a9))

# 0.2.0 (2026-04-11)


### Features

* add react utils & hooks ([3be2612](https://github-personal/HeoJeongBo/fluxion-render/commit/3be2612cd756340d52da3c3ce1082c6a95c73025))
* iniitial commit ([6d3b2b7](https://github-personal/HeoJeongBo/fluxion-render/commit/6d3b2b7ace2f33a1e2d285e342c5df8971f830cb))
* releaes setting ([3185abc](https://github-personal/HeoJeongBo/fluxion-render/commit/3185abc2a22c0f6e9dc8f7b320a4172ac1f2a5fe))
