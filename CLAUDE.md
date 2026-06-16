# fluxion-render — dev guide

pnpm monorepo. Three published packages (dependency order: worker ← render ← replay):

- `packages/fluxion-worker` — worker pool / messaging primitives
- `packages/fluxion-render` — OffscreenCanvas chart engine + React hooks (`/react`, `/testing`, `/worker` subpath exports)
- `packages/fluxion-replay` — recording / DVR time-travel on top of render
- `examples/vite-demo`, `examples/fluxion-replay-demo` — demo apps (workspace-linked; they resolve packages through `dist/`, so **rebuild after changing package source** or types/runtime will be stale)

Source layout is FSD-ish: `src/{app,entities,features,widgets,shared}` with colocated `*.test.ts(x)`.

## Commands (repo root)

```bash
pnpm build       # all packages, dependency-ordered — run BEFORE test (tests resolve workspace deps via dist)
pnpm test        # vitest per package (happy-dom; fake OffscreenCanvas in src/test/setup.ts)
pnpm typecheck   # tsc --noEmit per package
pnpm dev         # vite-demo
pnpm dev:replay  # fluxion-replay-demo
pnpm lint:fix    # biome check --write . (formatter + import sort; linter disabled)
```

## Conventions

- Conventional commits with package scope: `feat(render): …`, `fix(replay): …`, multi-scope `feat(render,examples): …`. `examples`-only commits never trigger a release.
- Draw-path tests use the `createFakeCtx()` call-recording pattern (assert `moveTo`/`lineTo`/`stroke` counts), `renderHook` + fake timers for hooks.
- Data timestamps are host-relative ms (`Date.now() - timeOrigin`); never push absolute epoch ms (Float32 quantization).

## Testing & coverage

- Coverage runs per package (no root script): `cd packages/<pkg> && pnpm vitest run --coverage`. Build render first (`pnpm --filter @heojeongbo/fluxion-render build`) so replay resolves it.
- Enforced thresholds (`vitest.config.ts`): render = 100% stmts/funcs/lines, 98% branches; worker = 100% stmts/funcs/lines, 90% branches; replay = 100% lines (binding).
- Patterns: `createFakeCtx()` (`src/test/setup.ts`) for canvas draw tests; a stub host whose `line(id)` returns a handle with a spyable `push` (see `use-simple-chart.test.tsx` `makeStubHost`) for stream-hook tests.
- React component tests run with vitest `globals:false` → testing-library auto-cleanup is OFF. Add `afterEach(cleanup)` or scope queries to the returned `container`, or you'll hit "Found multiple elements" across tests.
- v8-ignore: `/* v8 ignore next */` does NOT suppress cond-expr (`a?b:c`), binary-expr (`a??b`), or `if`-statement branches — use `/* v8 ignore start */ … /* v8 ignore stop */` for those, always with `-- reason`. The render branch gate is 98 (not 100) because v8 emits an untargetable phantom "implicit else" on every `if` without an `else`.
- replay `scenarios/09-*.test.ts` is timing-flaky ONLY under `--coverage` (v8 slowdown) — it carries per-test `testTimeout: 20_000`; don't touch VirtualClock/ReplayPlayer to "fix" it.

## Release

Per-package release-it via root scripts: `release[:worker|:replay][:patch|:minor|:major][:dry]`.
Pipeline: typecheck → test → build → version bump → CHANGELOG → tag (`fluxion-<pkg>-v<semver>`) → GitHub release → npm publish. Use the `release` skill.

**Caveats:**
- `release-it --dry-run` runs `npm version` FOR REAL — the `:dry` scripts auto-restore `package.json` afterward, but never trust a dirty tree after a dry-run; a leftover bump skews the next computed version.
- The plain `:dry` previews the DEFAULT (minor) bump — use `release:<pkg>:patch:dry` etc. to preview the level you actually intend.
- release-it requires a clean tree and branch `main`; `.env` must provide `GITHUB_TOKEN`.
