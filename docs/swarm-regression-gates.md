# Swarm regression gates

The Swarm branch uses a diff-first gate because the upstream tree currently has reproducible Rollup parser failures with the same pinned project toolchain. A Swarm slice is accepted only when its own files and focused tests are clean and the single overall build either passes or stops exclusively at a confirmed, byte-identical upstream blocker.

## Confirmed baseline

- Reference: `origin/main` at `30fb770a9f37a2414c34d0acd14f1fa289576d18`
- Captured: 2026-08-25
- Toolchain: Node 22.23.2, npm 9.2.0, Bun 1.3.14, Vite 7.3.6, svelte-check 4.7.6
- Result: `npm run build` stops in unchanged upstream Svelte files when Rollup receives TypeScript syntax. Module traversal can expose either `registry/+page.svelte:151:58` or `schedules/+page.svelte:769:57` first.
- The baseline also contains the existing `host-info.svelte` `highlightChanges` type diagnostic. It is matched by stable file and message because unrelated edits can shift its line number.
- Exact file hashes and accepted build/diagnostic signatures are stored in `scripts/swarm-gate-baseline.json`.

Neither baseline file belongs in a Swarm slice. Do not patch the parser error, Dockerfile, lockfile, or toolchain on this branch.

## Per-slice gate

Run the gate against the commit before the slice and list every focused test for that slice:

```bash
bun scripts/swarm-regression-gate.ts \
  --base HEAD^ \
  --test tests/swarm-environment-grouping.test.ts \
  --test tests/swarm-nodes.test.ts
```

The runner first verifies that `origin/main` still resolves to the captured commit and that all five tool versions match. It then rejects protected-file changes, runs `git diff --check`, parses every changed Svelte file, runs the repository diagnostics once and rejects diagnostics belonging to changed files, then runs only the explicitly supplied focused tests. Diagnostics in unchanged files remain visible to the upstream baseline but do not fail a Swarm slice.

## Single overall build

After the diff gate passes and the worktree is clean, add `--build` to exactly one gate invocation. The result is one of:

- `PASS overall-build`
- `PASS overall-build with known upstream baseline blocker`
- `FAIL` for any new or changed failure

The known-blocker result requires an exact file, line, column, message, and SHA-256 match. A receipt stored under the worktree's Git metadata prevents rebuilding the same commit and baseline twice. Do not rerun a failed build without a code change.

Refresh `scripts/swarm-gate-baseline.json` only after intentionally rebuilding a freshly fetched `origin/main` with the same toolchain and reviewing the new upstream result. Baseline refreshes must never modify the referenced upstream source files.
