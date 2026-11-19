---
id: BUG-37
type: bug
title: Merge request test misses its 5 s wait under load
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
created: 2026-11-19T21:45:00Z
history:
  - at: 2026-11-19T21:45:00Z
    field: status
    from: null
    to: New
    by: session:story-66
---

## Description

`packages/server/test/merge-request.test.ts` "request_merge (AC3) > puts an approval card in front of the user in the
Dev Lead's chat, and approving merges" failed in 2 of 2 full local `pnpm check` runs during STORY-66 on Windows
(2026-11-19). Each run took about 13 minutes. Both failed the same way:

```
AssertionError: expected [] to deeply equal [ Array(1) ]   (no "merged" notice for lead-1)
 ❯ test/merge-request.test.ts:36:30
     36|     expect(await notices(1)).toEqual([
Error: Hook timed out in 120000ms.
 ❯ prWorld test/story-prs-world.ts:163:3   (afterEach)
```

The test passes alone (both server files, 28 tests, 35 s), and the pre-commit gate passed in the same worktree right
after. STORY-66 doesn't change the merge, request or chat code this test uses.

Likely cause: the test's `notices(n)` helper polls for a fixed 5 s (200 × 25 ms). The local merge it waits on runs
real git (verify, merge, branch delete), and under full-suite load that can take longer. The `afterEach` then hangs for
120 s, maybe because closing waits on the merge that is still running. If so, it's the test's wait, not a product bug.
The cause looks like BUG-35's (a fixed wait missed under load), but this is a different module and wait, so it's filed
separately.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] The test passes 50 full `pnpm test:unit` runs in a row on Windows, with its assertions unchanged.
- [ ] A slow merge doesn't make `afterEach` hang for 120 s.

## Tasks

- [ ] Time how long the local merge takes to send its notice under load
- [ ] Fix the cause without weakening the test (for example, wait on the merge's notice rather than a fixed 5 s)
- [ ] Find out why `afterEach` hangs while a merge is running

## Notes

- Found by STORY-66 (PR #78). The gate log for one failure is in the STORY-66 session's scratchpad (vitest-all.txt).
  The other failure in those runs was BUG-35's send back test, and the third was the BUG-6 hook test, which fails only
  because PowerShell has no `sh` on PATH.
