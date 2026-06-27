# Contributing

Thanks for your interest in fluxion-render! This is a pnpm monorepo with three
published packages in dependency order: **fluxion-worker ← fluxion-render ← fluxion-replay**.

## Setup

```bash
pnpm install
pnpm build        # build all packages, dependency-ordered (run BEFORE test — tests resolve workspace deps via dist/)
```

## Workflow

```bash
pnpm test         # vitest per package (happy-dom; a fake OffscreenCanvas lives in src/test/setup.ts)
pnpm typecheck    # tsc --noEmit per package
pnpm lint:fix     # biome — formatter + import sort
pnpm dev          # vite-demo
pnpm dev:replay   # fluxion-replay-demo
```

The example apps resolve packages through `dist/`, so **rebuild after changing package source** or the demos will run against stale code.

## Coverage

Coverage is enforced per package (run from the package directory). Build
`fluxion-render` first so `fluxion-replay` resolves it:

```bash
pnpm --filter @heojeongbo/fluxion-render build
cd packages/<pkg> && pnpm vitest run --coverage
```

| Package | lines | statements | functions | branches |
|---|:-:|:-:|:-:|:-:|
| `fluxion-worker` | 99 | 99 | 100 | 90 |
| `fluxion-render` | 100 | 100 | 100 | 98 |
| `fluxion-replay` | 100 | 90 | 90 | 85 |

`fluxion-render`'s branch gate is 98 (not 100): the v8 coverage provider emits
an untargetable phantom "implicit-else" branch on every `if` without an `else`.
For genuinely-unreachable defensive branches, use
`/* v8 ignore start */ … /* v8 ignore stop */` with a `-- reason`.

## Commits

[Conventional commits](https://www.conventionalcommits.org/) with a package
scope: `feat(render): …`, `fix(replay): …`, `perf(worker): …`, multi-scope
`feat(render,examples): …`. `examples`-only commits never trigger a release.

## Pull requests

Before opening a PR: `pnpm typecheck && pnpm test && pnpm build` must pass, and
coverage must stay at or above the gates above. Keep changes scoped to one
concern per commit where practical.
