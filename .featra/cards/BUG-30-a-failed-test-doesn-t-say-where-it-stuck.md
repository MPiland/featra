---
id: BUG-30
type: bug
title: A failed test doesn't say where it stuck or show the screen
status: Done
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-30-test-failures
pr: https://github.com/MPiland/featra/pull/70
created: 2026-11-18T14:44:04Z
history:
  - at: 2026-11-18T14:44:04Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-18T15:19:02Z
    field: status
    from: New
    to: In Progress
    by: dev
  - at: 2026-11-18T16:38:14Z
    field: status
    from: In Progress
    to: In Review
    by: dev
  - at: 2026-11-18T17:51:46Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-18T17:51:46Z
    field: status
    from: In Review
    to: Done
    by: user
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

- [x] A failed or timed-out end-to-end test keeps a screenshot of the app window and the app's trace, with DOM snapshots, from the moment it failed (test: apps/desktop/e2e/failure-evidence.spec.ts::BUG-30: a test stopped while the app waits keeps a screenshot of its window and its trace with DOM snapshots, apps/desktop/e2e/evidence-run.spec.ts::BUG-30: a test that times out on a missing locator prints where it stopped and the files it kept, apps/desktop/test/e2e-harness.test.ts::e2e harness: what a failed test leaves behind (BUG-30) > gives every e2e test the fixture that keeps the app's screenshot and trace when it stops)
- [x] The CI log of a timed-out end-to-end test names the step and the locator it was waiting on (test: apps/desktop/test/stuck-step-reporter.test.ts::a timed-out e2e test names the step and the locator it was waiting on (BUG-30) > prints where each failed test stopped, in a real Playwright run with the e2e suite's reporters, apps/desktop/test/stuck-step-reporter.test.ts::a timed-out e2e test names the step and the locator it was waiting on (BUG-30) > names the action a test was still waiting in, with its locator as written at its code line, apps/desktop/e2e/evidence-run.spec.ts::BUG-30: a test that times out on a missing locator prints where it stopped and the files it kept)
- [x] A unit test stopped by the hang guard says what it was waiting for (test: tooling/test/wait-report.test.ts::a unit test stopped by the hang guard says what it was waiting for (BUG-30) > names the wait it was stopped in, how long it waited and the test line that asked, tooling/test/hang-guard.test.ts::the hang guard (BUG-28) > gives every project the setup file that names what a stopped test was waiting for (BUG-30), packages/server/test/ws-frames.test.ts::waiting for a frame (BUG-30) > is noted at the test line with what it matches, until the frame comes, packages/client/test/hang-guard.test.ts::Testing Library's waits (BUG-28) > are noted while they wait, at the test line, so a test the hang guard stops names it (BUG-30))
- [x] CI uploads these files for every failed end-to-end test on both Windows and Ubuntu (test: apps/desktop/test/e2e-harness.test.ts::e2e harness: what a failed test leaves behind (BUG-30) > uploads the failed tests' files from both e2e jobs in CI)
- [x] docs/testing.md says where to find them and how to open them (test: apps/desktop/test/e2e-harness.test.ts::e2e harness: what a failed test leaves behind (BUG-30) > says in docs/testing.md where the files are and how to open them)

## Tasks

## Notes

The user asked for this: tests need clear failures that can be traced to their cause, so they can be fixed properly.

Causes and fix: decisions.md, 2026-11-18 — BUG-30 fix.
