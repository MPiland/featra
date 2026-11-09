---
id: BUG-11
type: bug
title: Windows e2e user32 helper never answers ready
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
created: 2026-11-09T16:30:00Z
history:
  - at: 2026-11-09T16:30:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

E2E (Windows) failed before running any test in CI run 42648027018 (PR #9, head f25b42b, a commit that only changes a
card):

```
Error: The user32 helper didn't answer "ready" in 15000 ms
  at Timeout._onTimeout (apps/desktop/e2e/foreground.ts:76:20)
Error: e2e: harness processes outlived the run (a teardown leak):
  2868 powershell.exe ... -File apps/desktop/e2e/user32-helper.ps1
  at global-teardown.ts:11
```

The PowerShell user32 helper started but never printed "ready" within 15 s, and it was still running at teardown.
Gate and E2E (Ubuntu) passed in the same run. This is the harness, not product code. The helper came from BUG-3's fix.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes: slow PowerShell start on the runner, a blocked Add-Type compile, or
  something else
- [ ] The helper is stopped when it fails to start, so a start failure doesn't also show as a teardown leak
- [ ] E2E (Windows) passes 20 runs in a row with the tests' assertions unchanged

## Tasks

- [ ] Find why the helper didn't answer "ready"
- [ ] Fix the cause without weakening any test

## Notes

- Found by the Dev Lead while merging PR #9.
