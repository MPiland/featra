---
id: STORY-41
type: story
title: Every commit passes a lint, format and test gate
status: Done
parent: FEAT-13
order: 4
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T00:18:58Z
history:
  - at: 2026-11-06T00:18:58Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-06T05:11:03Z
    field: status
    from: New
    to: In Progress
    by: claude
  - at: 2026-11-06T14:56:50Z
    field: status
    from: In Progress
    to: In Review
    by: claude
  - at: 2026-11-06T15:04:33Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-06T15:04:33Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

As a builder, I can trust that every commit an agent makes is formatted, linted, type-checked and tested, so the code stays maintainable no matter which session wrote it. Uses OXC (oxlint and oxfmt) per ADR 0014; standards in docs/coding-standards.md.

## Acceptance criteria

- [x] `pnpm format` and `pnpm format:check` run oxfmt over the whole repo, and the codebase is formatted in one commit (test: tooling/test/check.test.ts AC1; formatting commit 29545d0)
- [x] `pnpm lint` runs oxlint with TypeScript, React, React Hooks, jsx-a11y and import rules, plus type-aware rules where supported, and passes with zero warnings (test: tooling/test/lint-rules.test.ts AC2)
- [x] An import that breaks the package boundaries in ADR 0011 (e.g. work-format importing React, client importing Electron) fails lint (test: tooling/test/lint-rules.test.ts AC3)
- [x] A source file over the agreed length cap fails lint; existing files over it are split, not exempted (test: tooling/test/lint-rules.test.ts AC4)
- [x] `pnpm check` runs format check, lint, typecheck and unit tests, and a git pre-commit hook runs it in every worktree (test: tooling/test/check.test.ts, tooling/test/pre-commit-hook.test.ts AC5)
- [x] ADR 0014 lists any OXC rule gaps and how each is covered (docs/adr/0014-quality-gate.md, Consequences)

## Tasks

- [x] Add oxlint, oxlint-tsgolint and oxfmt; `format`, `format:check`, `lint`, `check` scripts; `.oxlintrc.json`
- [x] Format the whole codebase in one commit
- [x] Fix every lint finding in work-format, client and desktop (type guards for parsed data, a11y roles, no casts)
- [x] Boundary rules for ADR 0011 per package, with deep-import patterns
- [x] Length cap of 300 lines; split `main.ts` (window, IPC, tray, native menu, test hooks) and the menu test
- [x] Pre-commit hook in `.githooks`, turned on by `pnpm install` for every worktree
- [x] `tooling` package: lint fixtures through the real config, `pnpm check` failing on a format violation, the hook blocking a commit in a temp repo and its worktree (the end-to-end journey)
- [x] ADR 0014 rule gaps; architecture map gains `tooling` and where lint rules go
- [x] Unit, e2e on Windows, WSLg and xvfb-run
- [x] Fix the preload regression the e2e run caught: client imports work-format's guards from `@featra/work-format/guards`, so the sandboxed preload doesn't bundle `yaml` (test: apps/desktop/test/preload-bundle.test.ts)

## Notes

- The first run of the hook test from inside the real hook inherited GIT_DIR and wrote to the shared `.git/config`
  (`core.bare = true` and a test `[user]`). Repaired by hand; the test now drops GIT_* variables and refuses to run
  unless git resolves to its temp repository.
- Windows e2e: 28 of 29 pass. `tray.spec.ts` "the tray's Show Featra and a tray click restore and focus the window"
  fails at the focus check in the full suite only; alone it passes 3 of 3. The base commit before STORY-41 (eb82985)
  fails the same way, so it predates this story. Linux: WSLg 29 passed; xvfb-run 28 passed, 1 skipped (BUG-1
  maximize needs a window manager).
