---
id: BUG-36
type: bug
title: Windows e2e first scan and feature Start miss their 5 s wait
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
created: 2026-11-19T16:40:00Z
history:
  - at: 2026-11-19T16:40:00Z
    field: status
    from: null
    to: New
    by: session:story-65
---

## Description

In CI run 44562162156 (PR #76, commit 4d5fed6, which only changed the app's version), E2E (Windows) failed two tests
that passed in the four runs before it on the same branch:

- `e2e/work-layout.spec.ts:53`, in `provenStory` at `e2e/proven-story.ts:80`: after Start on FEAT-2, `git branch`
  still listed only `main` after 5 s (expected `feature/2-shaping`).
- `e2e/work-list.spec.ts:60`, at line 68: the "Prove the core" epic wasn't in the Work list 5 s after launch. The
  app's `main.log` shows the window at 16:12:50.25, then at 16:12:55.57 "work scan failed: git worktree failed: fatal:
  not a git repository", which is the moment the test gave up and its teardown deleted the repo. So the first scan
  was still running after 5 s; the "not a git repository" line is a result of the teardown, not the cause.

The E2E suite took 7.4 min against 6.6 min in the green run before, so the runner was slower. Both waits use the
default 5 s on the app's first git work after launch or Start.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes: why the first scan or the feature's Start can take over 5 s on a
      Windows runner. If it is a product bug, a regression test fails before the fix.
- [ ] Both tests pass 20 E2E (Windows) runs in a row, with their assertions unchanged.

## Tasks

- [ ] Time the first scan and Start on a Windows runner from the app's log
- [ ] Fix the cause without weakening the tests

## Notes

- Found by STORY-65. Kept files: the `e2e-windows-traces` artifact of run 44562162156 (attempt 1).
