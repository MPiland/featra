---
id: BUG-12
type: bug
title: Work-watch and card-watch tests flake in full runs
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
created: 2026-11-09T12:00:00Z
history:
  - at: 2026-11-09T12:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

During STORY-7 on 2026-11-09, the pre-commit `pnpm check` failed on Windows in full runs. Each failing test passed when run alone, and the commit passed on retry:

```
FAIL |@featra/server| test/work-watch.test.ts > work watches > asks git again when a branch changes
Error: No list in 5000 ms
FAIL |@featra/server| test/ws-work.test.ts > card.watch and card.update (ADR 0017) > answers with the card, pushes it on an outside edit, and saves an edit to the owner
Error: No matching frame in 2000 ms
```

In one other run, `card-actions.test.ts` and `copy-actions.test.ts` failed together. That run may have been disturbed by a killed test loop, so treat it as unconfirmed. BUG-5, BUG-6 and BUG-7 found similar waits under load.

## Acceptance criteria

- [ ] Each failure is reproduced under load and its cause is recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] Each test passes 50 full runs in a row under that load, with its assertions unchanged. Any time limit that changes is justified in Notes.

## Tasks

- [ ] Reproduce under load and keep the output
- [ ] Fix the cause

## Notes
