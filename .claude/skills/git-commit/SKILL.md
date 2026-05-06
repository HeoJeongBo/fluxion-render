---
name: git-commit
description: Stage and commit changes in the fluxion-render monorepo with conventional commit format including package scope. Use when the user asks to commit changes.
allowed-tools: Bash, Read
---

# Git Commit — fluxion-render monorepo

Create a conventional commit with the correct package scope for this monorepo.

## Input

$ARGUMENTS

If arguments are provided, use them as the commit message (you may still infer or adjust the scope).
If no arguments are provided, infer the full commit message from the diff.

## Process

### Step 1: Gather change information

Run both commands:

```bash
git status --short
git diff --staged --name-only
git diff --name-only HEAD
```

### Step 2: Infer scope from changed file paths

Map paths to scopes using this table:

| Path prefix | Scope |
|---|---|
| `packages/fluxion-render/` | `render` |
| `packages/fluxion-worker/` | `worker` |
| `examples/` | `examples` |
| Root files (`package.json`, `pnpm-workspace.yaml`, `.npmrc`, etc.) | `root` |
| Multiple packages changed | list each, e.g. `render,worker` |

### Step 3: Infer commit type from the diff

If no arguments were given, run:

```bash
git diff --staged
```

Pick the type that best matches:

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build scripts, config, tooling, release |

### Step 4: Check staged files

If nothing is staged (`git diff --staged --name-only` returns empty):
- Show the user `git status --short`
- List which files would need to be staged
- Do NOT commit — stop and ask the user to stage files first

### Step 5: Commit

Use a HEREDOC to avoid quoting issues:

```bash
git commit -m "$(cat <<'EOF'
type(scope): subject
EOF
)"
```

## Commit message format

```
type(scope): subject
```

- Subject: imperative mood, lowercase, no period, max 72 chars
- No body unless the change is non-obvious

## Examples

```
feat(worker): add onMessage convenience method
fix(render): correct xAxis tick alignment
chore(root): update release scripts
refactor(render): extract worker pool to fluxion-worker
chore(render,worker): update publish registry config
docs(examples): add fluxion-worker calc demo
```

## After committing

Show the result of `git log --oneline -3` so the user can confirm the commit landed correctly.
