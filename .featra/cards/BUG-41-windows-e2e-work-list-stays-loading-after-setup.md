---
id: BUG-41
type: bug
title: Windows e2e Work list stays on Loading after project setup
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
created: 2026-11-25T09:20:00Z
history:
  - at: 2026-11-25T09:20:00Z
    field: status
    from: null
    to: New
    by: session:story-73
---

## Description

In CI run 45563738256 (PR #89, commit 5a72e7f, STORY-73), E2E (Windows) failed one test. The other six jobs passed,
and E2E (Windows) passed the other 89 tests:

- `e2e/setup.spec.ts:109`: after Done, the Work list still read "Loading…" when the default 5 s wait ended, not "No
  cards yet."
- The same test passed in 6.7 s on E2E (Windows) of run 45562563549 at d575bea. The product code there is the same
  as at 5a72e7f, which only changed the STORY-73 card.
- The app's socket frames in the trace show the server's answers after setup, timed from the window's first request:
  - `project.setup` answered in 236 ms.
  - `project.setupStatus` took 3.2 s (1,028 to 4,264 ms).
  - The new `work.watch` took 5.3 s (1,028 to 6,304 ms), past the test's wait.
  - A `work.list` event for the watch the client had already ended came at 4,975 ms.
- After the failure, closing the app took about 52 s, and the test ran into its 60 s timeout.

Every step before Done took milliseconds. The server's first scan of a just-created git repository was the slow part.
STORY-73 adds nothing to that path: its only new read-path code is a decoration of a single card's view (`card.watch`),
and nothing at startup.

This is the same kind of failure as BUG-36 and BUG-40: the app's first work on a slow Windows runner, against the
default 5 s wait. It hadn't failed in the last 40 failed runs.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes: why the first scan of a newly set-up project can take over 5 s on a
      Windows runner, and why the app takes about 52 s to close afterwards. If it is a product bug, a regression test
      fails before the fix.
- [ ] A `work.list` event no longer reaches a watch the client has ended, or Notes say why it is harmless.
- [ ] The test passes 20 E2E (Windows) runs in a row, with its assertions unchanged.

## Tasks

- [ ] Time `project.setupStatus` and the first `work.watch` after setup on a Windows runner from the app's log
- [ ] Find what holds the app's close after the failure
- [ ] Fix the cause without weakening the test

## Notes

- Found by STORY-73. Kept files: the `e2e-windows-traces` artifact of run 45563738256 (attempt 1), which has the
  socket frames in `electron-66.zip`.
- Possibly the same root cause as BUG-36 and BUG-40. Look at them together.
