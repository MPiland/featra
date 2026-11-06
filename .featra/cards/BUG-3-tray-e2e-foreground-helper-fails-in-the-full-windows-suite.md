---
id: BUG-3
type: bug
title: Tray e2e foreground helper fails in the full Windows suite
status: New
parent: FEAT-13
order: 7
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T17:27:13Z
history:
  - at: 2026-11-06T17:27:13Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

Found by the Dev Lead in the regression run after BUG-2 merged into `feature/13-app-shell` (7e16587). In two full Windows e2e runs, 2 and then 4 tests in `apps/desktop/e2e/tray.spec.ts` failed. All 9 tray tests pass when run alone. The failures come from BUG-2's harness change (`apps/desktop/e2e/foreground.ts`):

- `grantForeground` throws "Could not grant process … the foreground (AllowSetForegroundWindow)". Windows only lets the foreground process, or the process that got the last input, pass on the foreground right, and the PowerShell child is neither.
- `windowInForeground` starts PowerShell and compiles the user32 type with Add-Type on every call, which takes seconds. Its `expect.poll` (5 s) gets only one or two tries, and two tests hit the 60 s test timeout ("close hides the window…", "the tray's Exit exits while the window is hidden").

BUG-2's five clean runs were likely done while nobody was using the desktop. The suite has to pass while the user works.

## Acceptance criteria

- [ ] The foreground grant works whoever is in front, or the harness gets the grant some other legitimate way. The root cause is recorded in Notes.
- [ ] The OS foreground check is fast enough for `expect.poll`: one PowerShell or helper process per test run (or per test), not one per call.
- [ ] The full Windows e2e suite passes 5 runs in a row while the user is actively using the desktop, with every assertion unchanged, including BUG-2's `windowInForeground` checks.

## Tasks

- [ ] Reproduce with the desktop in use
- [ ] Fix the grant and the speed of the foreground helper
- [ ] Run the full suite on Windows (5 in a row, desktop in use) and on WSLg on its own

## Notes
