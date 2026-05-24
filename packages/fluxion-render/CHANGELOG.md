# Changelog

# [0.10.0](https://github.com/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.9.0...fluxion-render-v0.10.0) (2026-05-24)


### Features

* **render,replay,examples:** DX overhaul + bridge hook + testing utils ([48e5185](https://github.com/HeoJeongBo/fluxion-render/commit/48e5185f26c2139d7b6ebfe928e6694a24ce5a4d))

# [0.9.0](https://github.com/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.8.2...fluxion-render-v0.9.0) (2026-05-24)


### Bug Fixes

* **examples:** auto-play on DVR entry and fix scrubber drag-lock ([8a8b30e](https://github.com/HeoJeongBo/fluxion-render/commit/8a8b30ef6b153c3fa2523dfc0a46be5fe3cd91d0))
* **examples:** freeze timeline latest on DVR entry for correct scrubber behavior ([bd2e7ec](https://github.com/HeoJeongBo/fluxion-render/commit/bd2e7ec2c51f21053c2d64ebe5087f1389d95789))
* **examples:** move storage capacity bar above timeline scrubber ([c1c8c1c](https://github.com/HeoJeongBo/fluxion-render/commit/c1c8c1c4af74412c8b243288a906b880c03f231b))
* **examples:** snap scrubber to next segment on gap and fix DVR page overflow ([e6fd8de](https://github.com/HeoJeongBo/fluxion-render/commit/e6fd8deabca1e9c9c876001bcce8e0582da6686c))
* **replay,examples:** fix VP8 decoder dimension mismatch on Retina displays ([79b2b32](https://github.com/HeoJeongBo/fluxion-render/commit/79b2b3297275dd4d75fbaea12b517c9a68678636))
* **replay,examples:** revert seenKeyframe guard and fix timeline overflow ([6908302](https://github.com/HeoJeongBo/fluxion-render/commit/69083025f9bf185c76b2f97aa3170e563769f9a4))
* **replay:** add codedWidth/codedHeight to VideoChannel round-trip tests ([fd279c2](https://github.com/HeoJeongBo/fluxion-render/commit/fd279c29dd192e178cc641b924b0550f982364a1))
* **replay:** extend seek lookback to 3s to guarantee keyframe before decode ([3427a49](https://github.com/HeoJeongBo/fluxion-render/commit/3427a4938f6a3708519767a927e9cace4c81a213))


### Features

* **examples:** auto-return to live when replay reaches the live edge ([82521b2](https://github.com/HeoJeongBo/fluxion-render/commit/82521b2fbd96eff2c972176fc88671168af3da70))
* **render,replay,examples:** add useChartReplay for time-travel line charts ([6993fa9](https://github.com/HeoJeongBo/fluxion-render/commit/6993fa9f2cdec01783e54a61569c2810a748ba10))
* **replay,examples,render:** chart-replay DVR with scrub-then-play UX ([98e4544](https://github.com/HeoJeongBo/fluxion-render/commit/98e45444567349ec36049d13e6212c9f5546bd16))
* **replay,examples:** add @heojeongbo/fluxion-replay package with demo ([516aa01](https://github.com/HeoJeongBo/fluxion-render/commit/516aa0192d8fc6912302d5f20ca0f9bbb5cf4a69))
* **replay,examples:** add DVR time-travel demo and extend useReplayTimeline ([e7f089f](https://github.com/HeoJeongBo/fluxion-render/commit/e7f089ff4ee0ed9e8113bba05eefe75bfe03f5da))
* **replay,examples:** add perf fixes, DX improvements, storage API, and new hooks ([f43ac1c](https://github.com/HeoJeongBo/fluxion-render/commit/f43ac1c5c59dad150705515502d6998a93d30465))
* **replay,examples:** recording segments, gap visualization, and video fix ([29bd089](https://github.com/HeoJeongBo/fluxion-render/commit/29bd089fc67256bde3da13f217c62f35620ea0d3))

## [0.8.2](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.8.1...fluxion-render-v0.8.2) (2026-05-19)


### Features

* **render,examples:** add FluxionPieChart and classNames CSS injection support ([96f1c77](https://github-personal/HeoJeongBo/fluxion-render/commit/96f1c771bd6d9de361d89011dbd02e4aeaf83027))
* **render,examples:** add pie chart enter/update animations and fix StrictMode bug ([cb19933](https://github-personal/HeoJeongBo/fluxion-render/commit/cb19933110dcd62496eb0c49648b1d79cfb69e1a))

## [0.8.1](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.8.0...fluxion-render-v0.8.1) (2026-05-19)


### Features

* **render,examples:** add reference-line and pose-arrow layers ([7a0cc92](https://github-personal/HeoJeongBo/fluxion-render/commit/7a0cc92ae4784e19e31ab5bbd1fc406c8a2dd6b6))

# [0.8.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.7.3...fluxion-render-v0.8.0) (2026-05-18)


### Features

* **render,examples:** add robot visualization layers and demo dashboard ([438aca2](https://github-personal/HeoJeongBo/fluxion-render/commit/438aca2a3432276f1d0ba5dbd73b88faa2a7fd30))

## [0.7.3](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.7.2...fluxion-render-v0.7.3) (2026-05-18)


### Features

* **render,examples:** add crosshair + tooltip hover interaction ([eb2e4db](https://github-personal/HeoJeongBo/fluxion-render/commit/eb2e4dba1df2a8f45add0f2bd759a258e2d747a3))
* **worker,examples:** add /react subpath with hooks and React Hooks demo tab ([ff9f04a](https://github-personal/HeoJeongBo/fluxion-render/commit/ff9f04a14bde8eb5b0c8735378d1ecb491a3085b))

## [0.7.2](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.7.1...fluxion-render-v0.7.2) (2026-05-13)


### Features

* **render,examples:** dx improvements — factory fn exports, FluxionCanvas cleanup, null-host warning ([40d7ac6](https://github-personal/HeoJeongBo/fluxion-render/commit/40d7ac6ab77fb3eb09ff42dd1f322be76e0fde67))

## [0.7.1](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.7.0...fluxion-render-v0.7.1) (2026-05-13)


### Features

* **render,examples:** add area, step, bar, candlestick, heatmap chart layers ([3ec63bd](https://github-personal/HeoJeongBo/fluxion-render/commit/3ec63bd70ae625e1cbcab056fafb43c618f215c6))

# [0.7.0](https://github-personal/HeoJeongBo/fluxion-render/compare/fluxion-render-v0.6.0...fluxion-render-v0.7.0) (2026-05-11)


### Bug Fixes

* monorepo publish ([18304eb](https://github-personal/HeoJeongBo/fluxion-render/commit/18304eb4adc29f2fd37e4facda51eada72ae352e))

# [0.6.0](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.5.0...fluxion-render-v0.6.0) (2026-05-08)


### Bug Fixes

* npm publish warn issue ([00fcd91](https://github-personal/HeoJeongBo/fluxion-render/commit/00fcd91648443d77e64cc65ff2a453ca33e004ce))
* publish setting ([89a7097](https://github-personal/HeoJeongBo/fluxion-render/commit/89a70970c049e95ffef08470e80072b9cdc80f9d))
* registry setting ([4e956e6](https://github-personal/HeoJeongBo/fluxion-render/commit/4e956e643024759b1565705fad545fa8aa73bd63))
* release-it ([b2507c3](https://github-personal/HeoJeongBo/fluxion-render/commit/b2507c3541e4d9cc3464f3b087d2dac38496f14b))
* **worker:** abort pending requests on pool-backed dispose, remove handle from set on release ([e3576a6](https://github-personal/HeoJeongBo/fluxion-render/commit/e3576a63942b52d3fac869eaaedc89527cc534bb))


### Features

* add fluxion worker package ([b74be40](https://github-personal/HeoJeongBo/fluxion-render/commit/b74be4021d3bec77c760bf2b664ec09a31f0b45a))
* add standalone onMessage ([c586841](https://github-personal/HeoJeongBo/fluxion-render/commit/c58684100a07006547dd48a625e949cd8f0b1bf1))
* **render,examples:** add streaming scatter chart layer ([afdab3a](https://github-personal/HeoJeongBo/fluxion-render/commit/afdab3ae89996948ce7acd3ad440e7e81abd9ab2))
* update md ([d7e49db](https://github-personal/HeoJeongBo/fluxion-render/commit/d7e49dbd217c44e3e7dfa9f405aad5538436eb39))
* worker publish setting ([6ed8ef1](https://github-personal/HeoJeongBo/fluxion-render/commit/6ed8ef18fdcc3f5884aef7871ff8423ca3b6f823))
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

# [0.5.0](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.4.1...v0.5.0) (2026-04-24)


### Bug Fixes

* minor performance issue ([5af3285](https://github-personal/HeoJeongBo/fluxion-render/commit/5af3285fbe89514ca0699e4094dc942b8cf21577))


### Features

* axis to worker ([b3abe11](https://github-personal/HeoJeongBo/fluxion-render/commit/b3abe11e4c6f4b2bc4ac46f4f2f775ab6e56f395))

## [0.4.1](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.4.0...v0.4.1) (2026-04-21)


### Bug Fixes

* xAxis performance issue ([fb96608](https://github-personal/HeoJeongBo/fluxion-render/commit/fb96608e8864db3d9e16713cf863e12c2151e9a5))
* xAxis tick test ([bf93bf2](https://github-personal/HeoJeongBo/fluxion-render/commit/bf93bf2bbd98205b51486231b8e0b0dde8750961))

# [0.4.0](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.3.6...v0.4.0) (2026-04-21)


### Bug Fixes

* type issue ([61ad0db](https://github-personal/HeoJeongBo/fluxion-render/commit/61ad0dbc5dba7af6dc05e0d13b6c2a041d98f822))


### Features

* add fluxion table ([93d94be](https://github-personal/HeoJeongBo/fluxion-render/commit/93d94be093b20b2f415f5cabb6bde2c54b9f88b1))

## [0.3.6](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.3.5...v0.3.6) (2026-04-21)


### Features

* minor updates ([ae039ba](https://github-personal/HeoJeongBo/fluxion-render/commit/ae039ba69b67903758626a16c8760c80f48ce163))

## [0.3.5](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.3.4...v0.3.5) (2026-04-21)


### Features

* add line filter ([93fe677](https://github-personal/HeoJeongBo/fluxion-render/commit/93fe677a8fb670097088df902f39c01f887f94a7))

## [0.3.4](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.3.3...v0.3.4) (2026-04-21)


### Features

* add retention ms & historical ([2017777](https://github-personal/HeoJeongBo/fluxion-render/commit/2017777342e0a561f810878b1f0898d3037fcc03))

## [0.3.3](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.3.2...v0.3.3) (2026-04-21)


### Bug Fixes

* xAxis performance issue ([8a1af5a](https://github-personal/HeoJeongBo/fluxion-render/commit/8a1af5ab93439af7f84d2a458f1c0a5b77ea57bd))

## [0.3.2](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.3.1...v0.3.2) (2026-04-20)


### Features

* external axes performance ([0e7dc6b](https://github-personal/HeoJeongBo/fluxion-render/commit/0e7dc6b550441a35e9df409b69cbc64fe031a11e))

## [0.3.1](https://github.com/HeoJeongBo/fluxion-render/compare/v0.3.0...v0.3.1) (2026-04-18)


### Features

* recharts style ([d91b7dc](https://github.com/HeoJeongBo/fluxion-render/commit/d91b7dc93dcf54603da8728b4ddd6f0bf7a2a094))

# [0.3.0](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.2.4...v0.3.0) (2026-04-17)


### Features

* add external axis ([5c21bc6](https://github-personal/HeoJeongBo/fluxion-render/commit/5c21bc68c71dab64e6e39d0f2962ceae86d99a42))

## [0.2.4](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.2.3...v0.2.4) (2026-04-16)


### Features

* debounce on resize ([7e660ce](https://github-personal/HeoJeongBo/fluxion-render/commit/7e660cee2671a859c0fed401e86843f30a8d5b36))

## [0.2.3](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.2.2...v0.2.3) (2026-04-16)


### Features

* update md ([d825cb6](https://github-personal/HeoJeongBo/fluxion-render/commit/d825cb608c8d657e16a064ad247c4eb7a4640329))

## [0.2.2](https://github-personal/HeoJeongBo/fluxion-render/compare/v0.2.1...v0.2.2) (2026-04-16)


### Features

* add worker pool ([b84c72a](https://github-personal/HeoJeongBo/fluxion-render/commit/b84c72ae1431674e7320114098d1da89119884cd))

## [0.2.1](https://github.com/HeoJeongBo/fluxion-render/compare/v0.2.0...v0.2.1) (2026-04-11)


### Features

* color set option ([792bd66](https://github.com/HeoJeongBo/fluxion-render/commit/792bd66ff860f50877c6404c458a2ff79f2ac4a9))

# 0.2.0 (2026-04-11)


### Features

* add react utils & hooks ([3be2612](https://github.com/HeoJeongBo/fluxion-render/commit/3be2612cd756340d52da3c3ce1082c6a95c73025))
* iniitial commit ([6d3b2b7](https://github.com/HeoJeongBo/fluxion-render/commit/6d3b2b7ace2f33a1e2d285e342c5df8971f830cb))
* releaes setting ([3185abc](https://github.com/HeoJeongBo/fluxion-render/commit/3185abc2a22c0f6e9dc8f7b320a4172ac1f2a5fe))
