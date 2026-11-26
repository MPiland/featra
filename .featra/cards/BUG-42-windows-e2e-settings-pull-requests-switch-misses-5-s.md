---
id: BUG-42
type: bug
title: Windows e2e Settings pull requests switch misses 5 s
status: Done
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
created: 2026-11-25T14:00:00Z
history:
  - at: 2026-11-25T14:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-25T13:40:00Z
    field: status
    from: New
    to: Done
    by: session:bug-44
---

## Description

In CI run 45627132056 (PR #89, commit 1755643, the STORY-73 Accept commit), E2E (Windows) failed one test. The other
six jobs passed:

- `e2e/story-pr.spec.ts:47`: the "Open story PRs automatically" switch in Settings' "Pull requests" region was not
  found when the default 5 s wait ended.
- The commit only changed the STORY-73 card and `ROADMAP.md`. The same product code passed on all three platforms in
  run 45581963504 at 556e9c7, and the rerun of the failed job passed.
- Likely the same slow first answer on Windows as BUG-36, BUG-40 and BUG-41: Settings waits on the server before it
  renders the region.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] The test passes 20 E2E (Windows) runs in a row, with its assertions unchanged.

## Tasks

- [ ] Read the trace from run 45627132056 (attempt 1) for the time Settings took to load the project's settings
- [ ] Fix the cause without weakening the test

## Notes

Fixed by BUG-44: the setting's answer waited behind the scans every service queued at start; asks now share the next scan, and config writes retry a Windows EPERM. E2E (Windows) passed 10 runs in a row on PR #92: run 45671030090, attempts 1-10.
