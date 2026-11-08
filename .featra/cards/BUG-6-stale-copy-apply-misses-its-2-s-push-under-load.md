---
id: BUG-6
type: bug
title: Stale-copy Apply misses its 2 s push under load
status: New
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-08T16:00:00Z
history:
  - at: 2026-11-08T16:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

`packages/server/test/ws-work.test.ts` "applies a stale copy and pushes the list without it (STORY-3 AC6)" failed the pre-commit `pnpm check` once on 2026-11-08, on `feature/18-tests-run-on-ci` at 1312465 (after the BUG-5 fix), with "No matching frame in 2000 ms". Nothing else of ours was running. It then passed 5 of 5 runs of that file alone. BUG-5's notes already said AC6 was tight: Apply runs its own full scan, a `git restore` and a full `refresh`.

## Acceptance criteria

- [ ] The failure is reproduced under the full parallel unit run, the slow step is measured, and the cause is recorded in Notes. If the cause is a product bug, a regression test fails before the fix.
- [ ] The AC6 test passes 50 full `pnpm test:unit` runs in a row on Windows, with its assertions and its 2 s wait unchanged.

## Tasks

- [ ] Reproduce under the full unit run and time each step of Apply
- [ ] Fix the cause without weakening the test

## Notes

- Not traced to the feature in progress (STORY-3's code is in main), so this is on the project bug list.
