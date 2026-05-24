---
name: release
description: Analyze commits since each package's last release tag and recommend (or run) the appropriate pnpm release script. Use when the user asks to release, publish, or cut a version.
allowed-tools: Bash, Read
---

# Release — fluxion-render monorepo

Inspect what changed in each publishable package since its last release tag, recommend a SemVer bump per package, and run `pnpm release:<pkg>:<level>` after the user confirms.

The monorepo ships three independent packages, each tagged separately:

| Package | Tag pattern | Release script (from root) |
|---|---|---|
| `@heojeongbo/fluxion-worker` | `fluxion-worker-v<semver>` | `pnpm release:worker:<level>` |
| `@heojeongbo/fluxion-render` | `fluxion-render-v<semver>` | `pnpm release:<level>` |
| `@heojeongbo/fluxion-replay` | `fluxion-replay-v<semver>` | `pnpm release:replay:<level>` |

`<level>` is `patch | minor | major`. Each script calls `release-it` which performs: typecheck → test → build → version bump → CHANGELOG update → git tag → GitHub release → npm publish. **Treat as a risky / hard-to-reverse action.**

`examples/*` is not published — examples-only commits never trigger a release.

## Input

$ARGUMENTS

- No arguments → analyze all three packages and recommend per-package release commands. Default to dry-run.
- `--apply` (or user explicitly says "actually release" / "publish for real") → after confirmation, run the real release scripts in dependency order.
- `worker` / `render` / `replay` → restrict analysis to one package.
- A SemVer level (`patch`, `minor`, `major`) → use this level instead of inferring (still per package).

## Process

### Step 1: Find the last release tag per package

```bash
git tag --list 'fluxion-worker-v*' --sort=-v:refname | head -1
git tag --list 'fluxion-render-v*' --sort=-v:refname | head -1
git tag --list 'fluxion-replay-v*' --sort=-v:refname | head -1
```

If a tag is missing (brand-new package), fall back to `git log --oneline` from the repo root and ask the user where the release line starts. Do not invent a baseline.

### Step 2: List commits since each last tag

For each package's tag `T`:

```bash
git log T..HEAD --pretty=format:'%h %s' --no-merges
```

Discard:
- The "release" chore commit itself (e.g. `chore: release @heojeongbo/fluxion-replay v0.3.0`).
- Commits whose scope is **only** unrelated packages or `examples` / `root`. A `feat(examples)` does NOT release a library; a `feat(replay,examples)` DOES release replay.

For multi-scope commits like `feat(replay,examples,render)`, the commit counts for BOTH `replay` and `render`.

If a commit has no scope (`fix: …`), treat it as affecting **every** package — surface it to the user and ask.

### Step 3: Infer SemVer bump per package

Walk each package's commit list and pick the highest bump observed:

| Marker in commit subject | Implies |
|---|---|
| `feat!(scope):` or `BREAKING CHANGE:` in body | **major** |
| `feat(scope):` | **minor** |
| `fix(scope):`, `perf(scope):` | **patch** |
| `refactor(scope):` (touches public API) | **patch** (ask if unsure) |
| `test(scope):`, `docs(scope):`, `chore(scope):`, `refactor` (internal only) | **no release needed** |

If a package's commit list contains only no-release types, recommend skipping that package.

### Step 4: Summarise to the user

Print a table like:

```
Package          Last tag             Commits   Bump       Suggested command
fluxion-worker   fluxion-worker-v0.3.0      0   none       (skip)
fluxion-render   fluxion-render-v0.8.2      2   minor      pnpm release:minor
fluxion-replay   fluxion-replay-v0.3.0      4   minor      pnpm release:replay:minor
```

Below the table, list the commit subjects per package so the user can sanity-check.

### Step 5: Run the dry-run first

Unless the user said `--apply`, run the `:dry` variants in dependency order and stop:

```bash
# Dependency order (worker → render → replay; only run for packages that need a bump)
pnpm release:worker:dry      # if worker has commits
pnpm release:dry             # render (the default :dry alias)
pnpm release:replay:dry      # if replay has commits
```

Show the output to the user. Ask if they want to proceed with the real release.

### Step 6: Apply (only after explicit user "yes / apply / publish")

Run in dependency order. If any step fails, **stop** — do not run subsequent packages. release-it leaves the working tree dirty on failure; let the user inspect.

```bash
pnpm release:worker:<level>   # if needed, FIRST (other packages depend on it)
pnpm release:<level>          # render, depends on worker
pnpm release:replay:<level>   # depends on render
```

After each successful run, `git log --oneline -2` and `git tag --list 'fluxion-<pkg>-v*' --sort=-v:refname | head -1` to confirm.

## Safety rules

- Never run a real (non-dry) release without explicit user confirmation in this session. "release" by itself defaults to dry-run + summary.
- Never run `release-it` with `--no-git`, `--no-github`, or `--no-npm`. The configured pipeline assumes the full flow.
- If `git status` is not clean before starting, stop and tell the user — release-it requires a clean tree.
- If the user is on a branch other than `main`, surface that and ask before continuing.
- If recent commits include `chore: release …` already past the last tag, something went wrong (tag missing or push failed) — stop and explain.

## Examples

```
# Analyze + dry-run all packages
/release

# Only inspect replay
/release replay

# Force minor across the board (still defaults to dry-run first)
/release minor

# After dry-run looks good
/release --apply
```

## After releasing

For each released package, surface:

```bash
git log --oneline -1
git tag --list 'fluxion-<pkg>-v*' --sort=-v:refname | head -1
```

And remind the user to verify the npm version + GitHub release landed.
