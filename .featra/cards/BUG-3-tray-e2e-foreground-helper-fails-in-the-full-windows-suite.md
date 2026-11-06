---
id: BUG-3
type: bug
title: Tray e2e foreground helper fails in the full Windows suite
status: In Review
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
  - at: 2026-11-06T17:28:31Z
    field: status
    from: New
    to: In Progress
    by: session:bug-2
  - at: 2026-11-06T17:41:58Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-2
---

## Description

Found by the Dev Lead in the regression run after BUG-2 merged into `feature/13-app-shell` (7e16587). In two full Windows e2e runs, 2 and then 4 tests in `apps/desktop/e2e/tray.spec.ts` failed. All 9 tray tests pass when run alone. The failures come from BUG-2's harness change (`apps/desktop/e2e/foreground.ts`):

- `grantForeground` throws "Could not grant process … the foreground (AllowSetForegroundWindow)". Windows only lets the foreground process, or the process that got the last input, pass on the foreground right, and the PowerShell child is neither.
- `windowInForeground` starts PowerShell and compiles the user32 type with Add-Type on every call, which takes seconds. Its `expect.poll` (5 s) gets only one or two tries, and two tests hit the 60 s test timeout ("close hides the window…", "the tray's Exit exits while the window is hidden").

BUG-2's five clean runs were likely done while nobody was using the desktop. The suite has to pass while the user works.

## Acceptance criteria

- [x] The foreground grant works whoever is in front, or the harness gets the grant some other legitimate way. The root cause is recorded in Notes.
- [x] The OS foreground check is fast enough for `expect.poll`: one PowerShell or helper process per test run (or per test), not one per call.
- [x] The full Windows e2e suite passes 5 runs in a row while the user is actively using the desktop, with every assertion unchanged, including BUG-2's `windowInForeground` checks.

## Tasks

- [x] Reproduce with the desktop in use
- [x] Fix the grant and the speed of the foreground helper
- [x] Run the full suite on Windows (5 in a row, desktop in use) and on WSLg on its own

## Notes

- Root cause, grant: Windows lets only the process that got the user's last input pass on the foreground right.
  BUG-2's grant attached the PowerShell helper's thread to the foreground thread and called AllowSetForegroundWindow,
  which returns false whenever another process has the last input, so it failed while someone used another app.
- Root cause, speed: every user32 call started PowerShell and compiled the Add-Type bindings (seconds per call), so
  `expect.poll` got one or two tries in 5 s and the slow grants pushed two tests past the 60 s timeout.
- Measured with a long-lived helper and a busy-user window in front (Featra in front after Show Featra): no grant 0/4,
  AttachThreadInput grant 0/4 (AllowSetForegroundWindow false), SendInput zero mouse move + AllowSetForegroundWindow
  4/4. The move makes the helper the last-input process, as a real tray click makes Explorer; the pointer doesn't move.
- Fix (test harness only, product code unchanged): `e2e/user32-helper.ps1` is one long-lived PowerShell per test
  worker that compiles once and answers `foreground` and `grant <pid>` in about 8 ms. Its grant is the SendInput move,
  then AllowSetForegroundWindow. Recorded in decisions.md.
- Regression test: the two focus tests start `busyUserInFront()` (`e2e/busy-user.ps1`, a small window that takes the
  foreground and keeps getting input) before restoring Featra, so the lock is on in every run, not only when someone is
  at the desktop. With the old grant (0d96ea4) 5 of 9 tray tests failed with "Could not grant process … the
  foreground"; with the SendInput grant (0d349b2) 9 of 9 passed. No assertion was changed, removed or moved.
- E2E Windows: 5 full runs in a row at 0d349b2, 30 passed each (about 42 s a run), with the busy-user window holding
  the input during the focus tests. The desktop was in the user's session; I didn't control what the user was doing.
- E2E WSL Ubuntu WSLg, on its own: 30 passed (0d349b2). The menu.spec.ts "Edit items" paste flake did not recur.

## Tests

- AC1: `apps/desktop/e2e/tray.spec.ts` "the tray's Show Featra and a tray click restore and focus the window" and
  "launching Featra again shows the running app's window…" (busy user in front; red at 0d96ea4, green at 0d349b2);
  harness `apps/desktop/e2e/user32-helper.ps1`, `apps/desktop/e2e/busy-user.ps1`, `apps/desktop/e2e/foreground.ts`
- AC2: `apps/desktop/e2e/foreground.ts` (one helper per worker), exercised by every `windowInForeground` poll in
  `apps/desktop/e2e/tray.spec.ts`
- AC3: the full Windows e2e suite (`pnpm run test:e2e` in `apps/desktop`), 5 runs in a row, 30 of 30 each
