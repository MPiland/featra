---
id: BUG-30
type: bug
title: A failed test doesn't say where it stuck or show the screen
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
created: 2026-11-18T15:30:00Z
history:
  - at: 2026-11-18T15:30:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

On PR #65 (CI run 44325009303, E2E Windows), `card-pane.spec.ts` "open a story, edit its user story and status…"
failed. The CI log said only "Test timeout of 60000ms exceeded". It named no step and kept no screenshot.

The kept `trace.zip` held only the test runner's own steps. It showed that the click on "Cards and the feature list"
waited 30 s and that the app took about 60 s to show its title bar. It held no screenshot or DOM snapshot of the app,
so why the Work list never loaded can't be told.

Causes found so far:

- `traceUntilClosed` in `apps/desktop/e2e/app.ts` saves the app's trace (screenshots, snapshots) only when the app
  closes. Specs call `app.close()` at the end of `try`, not in `finally`, so a test that times out never saves it.
  The trace that would show the screen is lost exactly when it is needed.
- When the test timeout ends a test that is waiting in a step, the list reporter prints only the test timeout. The
  step's own error ("waiting for getByRole(...)…") reaches only the trace.
- Unit tests: since BUG-28, `until` and `expect.poll` wait without a deadline. A hung wait ends at the hang guard with
  vitest's generic test timeout, which doesn't say what was being waited for.

## Acceptance criteria

- [ ] A failed or timed-out end-to-end test keeps a screenshot of the app window and the app's trace, with DOM snapshots, from the moment it failed
- [ ] The CI log of a timed-out end-to-end test names the step and the locator it was waiting on
- [ ] A unit test stopped by the hang guard says what it was waiting for
- [ ] CI uploads these files for every failed end-to-end test on both Windows and Ubuntu
- [ ] docs/testing.md says where to find them and how to open them

## Tasks

## Notes

The user asked for this: tests need clear failures that can be traced to their cause, so they can be fixed properly.
