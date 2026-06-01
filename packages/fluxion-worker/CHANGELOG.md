# Changelog

## [0.3.1](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.3.0...fluxion-worker-v0.3.1) (2026-06-01)


### Bug Fixes

* **examples:** auto-play on DVR entry and fix scrubber drag-lock ([8a8b30e](https://github-personal/HeoJeongBo/fluxion-render/commit/8a8b30ef6b153c3fa2523dfc0a46be5fe3cd91d0))
* **examples:** freeze timeline latest on DVR entry for correct scrubber behavior ([bd2e7ec](https://github-personal/HeoJeongBo/fluxion-render/commit/bd2e7ec2c51f21053c2d64ebe5087f1389d95789))
* **examples:** move storage capacity bar above timeline scrubber ([c1c8c1c](https://github-personal/HeoJeongBo/fluxion-render/commit/c1c8c1c4af74412c8b243288a906b880c03f231b))
* **examples:** snap scrubber to next segment on gap and fix DVR page overflow ([e6fd8de](https://github-personal/HeoJeongBo/fluxion-render/commit/e6fd8deabca1e9c9c876001bcce8e0582da6686c))
* **replay,examples:** fix VP8 decoder dimension mismatch on Retina displays ([79b2b32](https://github-personal/HeoJeongBo/fluxion-render/commit/79b2b3297275dd4d75fbaea12b517c9a68678636))
* **replay,examples:** revert seenKeyframe guard and fix timeline overflow ([6908302](https://github-personal/HeoJeongBo/fluxion-render/commit/69083025f9bf185c76b2f97aa3170e563769f9a4))
* **replay:** add codedWidth/codedHeight to VideoChannel round-trip tests ([fd279c2](https://github-personal/HeoJeongBo/fluxion-render/commit/fd279c29dd192e178cc641b924b0550f982364a1))
* **replay:** correct test array type annotation in dvr-metric-buffer.test.ts ([586d5ac](https://github-personal/HeoJeongBo/fluxion-render/commit/586d5ac121b1565f8a9808c12bb597a8189e854d))
* **replay:** extend seek lookback to 3s to guarantee keyframe before decode ([3427a49](https://github-personal/HeoJeongBo/fluxion-render/commit/3427a4938f6a3708519767a927e9cace4c81a213))
* **replay:** suppress React act() teardown race and upgrade vitest to 4.1.7 ([322baab](https://github-personal/HeoJeongBo/fluxion-render/commit/322baab0102ad308caeb296ef54f0e9101dd6c07))


### Features

* **examples:** auto-return to live when replay reaches the live edge ([82521b2](https://github-personal/HeoJeongBo/fluxion-render/commit/82521b2fbd96eff2c972176fc88671168af3da70))
* **render,examples:** add crosshair + tooltip hover interaction ([eb2e4db](https://github-personal/HeoJeongBo/fluxion-render/commit/eb2e4dba1df2a8f45add0f2bd759a258e2d747a3))
* **render,examples:** add FluxionPieChart and classNames CSS injection support ([96f1c77](https://github-personal/HeoJeongBo/fluxion-render/commit/96f1c771bd6d9de361d89011dbd02e4aeaf83027))
* **render,examples:** add pie chart enter/update animations and fix StrictMode bug ([cb19933](https://github-personal/HeoJeongBo/fluxion-render/commit/cb19933110dcd62496eb0c49648b1d79cfb69e1a))
* **render,examples:** add reference-line and pose-arrow layers ([7a0cc92](https://github-personal/HeoJeongBo/fluxion-render/commit/7a0cc92ae4784e19e31ab5bbd1fc406c8a2dd6b6))
* **render,examples:** add robot visualization layers and demo dashboard ([438aca2](https://github-personal/HeoJeongBo/fluxion-render/commit/438aca2a3432276f1d0ba5dbd73b88faa2a7fd30))
* **render,replay,examples:** add useChartReplay for time-travel line charts ([6993fa9](https://github-personal/HeoJeongBo/fluxion-render/commit/6993fa9f2cdec01783e54a61569c2810a748ba10))
* **render,replay,examples:** DX overhaul + bridge hook + testing utils ([48e5185](https://github-personal/HeoJeongBo/fluxion-render/commit/48e5185f26c2139d7b6ebfe928e6694a24ce5a4d))
* **replay,examples,render:** chart-replay DVR with scrub-then-play UX ([98e4544](https://github-personal/HeoJeongBo/fluxion-render/commit/98e45444567349ec36049d13e6212c9f5546bd16))
* **replay,examples:** add @heojeongbo/fluxion-replay package with demo ([516aa01](https://github-personal/HeoJeongBo/fluxion-render/commit/516aa0192d8fc6912302d5f20ca0f9bbb5cf4a69))
* **replay,examples:** add auto-eviction, storage logging, and user scenario tests ([1a9e862](https://github-personal/HeoJeongBo/fluxion-render/commit/1a9e8620b5f479e7dcbb2d74be16e5983cb53f4e))
* **replay,examples:** add DVR time-travel demo and extend useReplayTimeline ([e7f089f](https://github-personal/HeoJeongBo/fluxion-render/commit/e7f089ff4ee0ed9e8113bba05eefe75bfe03f5da))
* **replay,examples:** add perf fixes, DX improvements, storage API, and new hooks ([f43ac1c](https://github-personal/HeoJeongBo/fluxion-render/commit/f43ac1c5c59dad150705515502d6998a93d30465))
* **replay,examples:** recording segments, gap visualization, and video fix ([29bd089](https://github-personal/HeoJeongBo/fluxion-render/commit/29bd089fc67256bde3da13f217c62f35620ea0d3))
* **replay:** maximize test coverage and add chart replay perf optimizations ([cadb2eb](https://github-personal/HeoJeongBo/fluxion-render/commit/cadb2eb0506b4e4910d673859c620dbdbdde9f29))

# [0.3.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.2.0...fluxion-worker-v0.3.0) (2026-05-18)


### Features

* **render,examples:** add area, step, bar, candlestick, heatmap chart layers ([3ec63bd](https://github-personal/HeoJeongBo/fluxion-render/commit/3ec63bd70ae625e1cbcab056fafb43c618f215c6))
* **render,examples:** dx improvements — factory fn exports, FluxionCanvas cleanup, null-host warning ([40d7ac6](https://github-personal/HeoJeongBo/fluxion-render/commit/40d7ac6ab77fb3eb09ff42dd1f322be76e0fde67))
* **worker,examples:** add /react subpath with hooks and React Hooks demo tab ([ff9f04a](https://github-personal/HeoJeongBo/fluxion-render/commit/ff9f04a14bde8eb5b0c8735378d1ecb491a3085b))

# [0.2.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.10...fluxion-worker-v0.2.0) (2026-05-11)


### Bug Fixes

* monorepo publish ([18304eb](https://github-personal/HeoJeongBo/fluxion-render/commit/18304eb4adc29f2fd37e4facda51eada72ae352e))


### Features

* **render,examples:** add streaming scatter chart layer ([afdab3a](https://github-personal/HeoJeongBo/fluxion-render/commit/afdab3ae89996948ce7acd3ad440e7e81abd9ab2))

## [0.1.10](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.9...fluxion-worker-v0.1.10) (2026-05-08)


### Bug Fixes

* **worker:** abort pending requests on pool-backed dispose, remove handle from set on release ([e3576a6](https://github-personal/HeoJeongBo/fluxion-render/commit/e3576a63942b52d3fac869eaaedc89527cc534bb))


### Features

* **worker:** add isTerminated getter, strip hostId from onMessage, fix WorkerLike, safe subclass override ([e8508c4](https://github-personal/HeoJeongBo/fluxion-render/commit/e8508c4fb18f0fa5e0aab9a2925ffbb52668c85e))
* **worker:** preserve worker stack, harden dispose race, immutable postMessage ([c547afe](https://github-personal/HeoJeongBo/fluxion-render/commit/c547afec63be6ce0c359c2452480bb5f4569c0e0))

## [0.1.9](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.8...fluxion-worker-v0.1.9) (2026-05-06)


### Features

* **worker,examples:** add dispatch, dispose, WorkerTimeoutError.is ([4afcf1d](https://github-personal/HeoJeongBo/fluxion-render/commit/4afcf1dd45e092ec9592d88e2aaa973124586626))
* **worker,examples:** add request, stats, onError, defineWorkerWithState ([239db37](https://github-personal/HeoJeongBo/fluxion-render/commit/239db37768d606b078878eae6c8a9305a0f00267))

## [0.1.8](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.7...fluxion-worker-v0.1.8) (2026-05-04)

## [0.1.7](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.6...fluxion-worker-v0.1.7) (2026-05-04)

## [0.1.6](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.5...fluxion-worker-v0.1.6) (2026-05-04)


### Bug Fixes

* release-it ([b2507c3](https://github-personal/HeoJeongBo/fluxion-render/commit/b2507c3541e4d9cc3464f3b087d2dac38496f14b))

## [0.1.5](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.4...fluxion-worker-v0.1.5) (2026-05-04)


### Bug Fixes

* registry setting ([4e956e6](https://github-personal/HeoJeongBo/fluxion-render/commit/4e956e643024759b1565705fad545fa8aa73bd63))

## [0.1.4](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.3...fluxion-worker-v0.1.4) (2026-05-04)


### Bug Fixes

* publish setting ([89a7097](https://github-personal/HeoJeongBo/fluxion-render/commit/89a70970c049e95ffef08470e80072b9cdc80f9d))

## [0.1.3](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.2...fluxion-worker-v0.1.3) (2026-05-04)


### Bug Fixes

* npm publish warn issue ([00fcd91](https://github-personal/HeoJeongBo/fluxion-render/commit/00fcd91648443d77e64cc65ff2a453ca33e004ce))


### Features

* add standalone onMessage ([c586841](https://github-personal/HeoJeongBo/fluxion-render/commit/c58684100a07006547dd48a625e949cd8f0b1bf1))

## [0.1.2](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.1...fluxion-worker-v0.1.2) (2026-05-04)


### Features

* update md ([d7e49db](https://github-personal/HeoJeongBo/fluxion-render/commit/d7e49dbd217c44e3e7dfa9f405aad5538436eb39))

## [0.1.1](https://github.com/HeoJeongBo/fluxion-render/compare/fluxion-worker-v0.1.0...fluxion-worker-v0.1.1) (2026-05-04)

### Features

* add fluxion worker package ([b74be40](https://github.com/HeoJeongBo/fluxion-render/commit/b74be4021d3bec77c760bf2b664ec09a31f0b45a))
* worker publish setting ([6ed8ef1](https://github.com/HeoJeongBo/fluxion-render/commit/6ed8ef18fdcc3f5884aef7871ff8423ca3b6f823))
