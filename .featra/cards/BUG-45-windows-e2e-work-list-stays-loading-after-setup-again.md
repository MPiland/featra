---
id: BUG-45
type: bug
title: Windows e2e Work list stays on Loading after setup, again
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
created: 2026-11-27T14:11:58Z
history:
  - at: 2026-11-27T14:11:58Z
    field: status
    from: null
    to: New
    by: session:bug-40
---

## Description

BUG-41 is back after BUG-44 closed it. In CI run 45968240720 (PR #93, commit d71203f, BUG-40), attempt 24, E2E
(Windows) job 140491756384 failed one test:

- `e2e/setup.spec.ts:109`: after Done, the Work list still read "Loading…" when the default 5 s wait ended, not "No
  cards yet."
- The page's socket frames in the app's trace, timed from the page's first request:
  - `project.setup` answered in 0.9 s (591 to 1,468 ms).
  - At Done, `project.setupStatus` and `work.watch` were sent together at 2,041 ms. `project.setupStatus` answered at
    7,113 ms (5.1 s) and `work.watch` at 9,178 ms (7.1 s), past the test's wait.
- After the failure, closing the app took about 52 s, so the test ran into its 60 s timeout, and no `main.log` was
  kept.

The page's socket opened at once, so this is not BUG-40. As in BUG-41, the server's first work on a just-created git
repository is the slow part on a Windows runner. The other 23 attempts of the run passed this test.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes with timings: why the first `project.setupStatus` and `work.watch` of a
      just-set-up project can take over 5 s on a Windows runner, and why closing the app then takes about 52 s. A
      regression test fails before the fix.
- [ ] `setup.spec.ts` passes 20 E2E (Windows) runs in a row, with its assertions unchanged.

## Tasks

- [ ] Time the server's calls after setup on a Windows runner
- [ ] Find what holds the app's close
- [ ] Fix the cause without weakening the test

## Notes

- Found by BUG-40. Kept files: the `e2e-windows-traces` artifact of run 45968240720 (attempt 24).
- See BUG-41 (the same failure, closed by BUG-44) and BUG-44's notes on the first scan.
