---
id: BUG-40
type: bug
title: Windows e2e chat list's provider group misses its 5 s wait
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
created: 2026-11-24T16:30:00Z
history:
  - at: 2026-11-24T16:30:00Z
    field: status
    from: null
    to: New
    by: session:story-72
---

## Description

In CI run 45420608964 (PR #87, commit 882a953, STORY-72), E2E (Windows) failed one test. The other six jobs passed,
and E2E (Windows) passed the other 83 tests:

- `e2e/chat-list.spec.ts:34`: the "Claude Code" group wasn't in the Chats region 5 s after launch.
- The app's `main.log` shows the server listening at 15:03:33.68 and the window shown at 15:03:33.72. The test then
  gave up at the default 5 s timeout, and its run took 6.0 s in all.
- The page snapshot Playwright took when the test failed already shows `group "Claude Code"` with an empty list. So
  the group came, but only after the wait ended.

The group shows once the server's provider list answers: the `claude` stand-in is found on the PATH and named by the
server. The test had never failed on main or a feature branch before. Of the last 60 failed runs, the only other
chat-list failure was on macOS at a different line, on a story branch.

STORY-72's change doesn't touch provider detection, the chat list or startup:

- The evidence copies folder is cleared on the first open, not at launch.
- The new host providers in the client only wrap the same contexts.

This is the same kind of failure as BUG-36: the app's first work after launch on a slow Windows runner, against the
default 5 s wait.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes: why the provider group can take over 5 s to show on a Windows runner.
      If it is a product bug, a regression test fails before the fix.
- [ ] The test passes 20 E2E (Windows) runs in a row, with its assertions unchanged.

## Tasks

- [ ] Time the provider list's first answer on a Windows runner from the app's log
- [ ] Fix the cause without weakening the test

## Notes

- Found by STORY-72. Kept files: the `e2e-windows-traces` artifact of run 45420608964 (attempt 1).
- Possibly the same root cause as BUG-36. Look at the two together.
