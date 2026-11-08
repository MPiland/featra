---
id: BUG-5
type: bug
title: Unit tests time out under load
status: In Progress
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-5-timeouts-1d5c10
pr: null
created: 2026-11-07T21:37:53Z
history:
  - at: 2026-11-07T21:37:53Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-07T21:10:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-5
---

## Description

Two unit tests failed the pre-commit `pnpm check` once on 2026-11-07, on BUG-4's branch, during a commit that touched only a card. A retry passed 636 of 636. Each is a timeout, which suggests timing flakiness under load.

- `tooling` `check.test.ts` "format:check flags the file" hit its 5 s timeout.
- `packages/server` `ws-work.test.ts` "applies a stale copy" got no frame within 2000 ms.

## Acceptance criteria

- [ ] Each failure is reproduced under load (for example `pnpm check` alongside an e2e run, or vitest with high parallelism), and its cause is recorded in Notes.
- [ ] Each test passes 50 runs in a row under that load, with its assertions unchanged. Any time limit that changes is justified in Notes, not raised just to pass.

## Tasks

- [ ] Reproduce under load and keep the output
- [ ] Fix the cause (test isolation, waiting on a real event instead of a fixed time, or the product)

## Notes
- 2026-11-07 (Dev Lead): `ws-work.test.ts` failed again with "No matching frame in 2000 ms" on main at 0223de8, during the pre-commit check for this card. No e2e or other session test run was going at the time, so load from e2e isn't needed to trigger it.
