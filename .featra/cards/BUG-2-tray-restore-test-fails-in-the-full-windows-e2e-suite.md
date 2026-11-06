---
id: BUG-2
type: bug
title: Tray restore test fails in the full Windows e2e suite
status: New
parent: FEAT-13
order: 6
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T15:00:41Z
history:
  - at: 2026-11-06T15:00:41Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

Found while reviewing STORY-41. On Windows, `apps/desktop/e2e/tray.spec.ts` "the tray's Show Featra and a tray click restore and focus the window" fails when the whole e2e suite runs, and passes when run alone (3 of 3). It fails the same way on the feature branch before STORY-41 (eb82985), so STORY-41 didn't cause it. The suite was 29 of 29 when STORY-18 merged, so the failure is intermittent. The cause is unknown: it could be a real focus bug (Windows refusing to bring a background window forward) or the test depending on state left by an earlier test.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes. If it's a product bug, a regression test fails before the fix.
- [ ] Show Featra and a tray click restore and focus the window, proven by the tray test passing in the full Windows suite five runs in a row, with its assertions unchanged.

## Tasks

- [ ] Reproduce in the full Windows suite and capture which earlier test leaves the state behind
- [ ] Fix the product code, or isolate the test, without weakening any assertion
- [ ] Run the full suite on Windows and Linux (WSLg, on its own)

## Notes
