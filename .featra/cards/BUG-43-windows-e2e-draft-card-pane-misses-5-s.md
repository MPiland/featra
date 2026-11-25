---
id: BUG-43
type: bug
title: Windows e2e draft card pane misses 5 s
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
created: 2026-11-25T16:30:00Z
history:
  - at: 2026-11-25T16:30:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

In CI run 45630801411 (PR #90, commit 6c87661, the FEAT-9 Accept commit), E2E (Windows) failed two tests on its first
attempt. The other six jobs passed, and the rerun of E2E (Windows) passed:

- `e2e/review-draft.spec.ts:36`: the "FEAT-2 card" pane beside the drafting chat was not visible when the default 5 s
  wait ended, and the test then ran into its 60 s timeout.
- `e2e/tray.spec.ts:82` also failed in the same attempt (BUG-27).
- The commit only changed cards and `ROADMAP.md` against c4ef863, whose product code passed E2E (Windows). The runner
  was slow in that attempt: the tray tests took 21.7 s and 28.8 s.
- Likely the same slow first answer on Windows as BUG-36, BUG-40, BUG-41 and BUG-42.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] The test passes 20 E2E (Windows) runs in a row, with its assertions unchanged.

## Tasks

- [ ] Read the trace from run 45630801411 (attempt 1) for when the draft's card reached the client
- [ ] Fix the cause without weakening the test

## Notes
