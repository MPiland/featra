---
id: BUG-2
type: bug
title: Tray restore test fails in the full Windows e2e suite
status: Done
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
  - at: 2026-11-06T16:24:17Z
    field: status
    from: New
    to: In Progress
    by: session:bug-2
  - at: 2026-11-06T17:12:38Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-2
  - at: 2026-11-06T17:19:15Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-06T17:19:15Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

Found while reviewing STORY-41. On Windows, `apps/desktop/e2e/tray.spec.ts` "the tray's Show Featra and a tray click restore and focus the window" fails when the whole e2e suite runs, and passes when run alone (3 of 3). It fails the same way on the feature branch before STORY-41 (eb82985), so STORY-41 didn't cause it. The suite was 29 of 29 when STORY-18 merged, so the failure is intermittent. The cause is unknown: it could be a real focus bug (Windows refusing to bring a background window forward) or the test depending on state left by an earlier test.

## Acceptance criteria

- [x] The cause is found and recorded in Notes. If it's a product bug, a regression test fails before the fix.
- [x] Show Featra and a tray click restore and focus the window, proven by the tray test passing in the full Windows suite five runs in a row, with its assertions unchanged.

## Tasks

- [x] Reproduce in the full Windows suite and capture which earlier test leaves the state behind (none does: see Notes)
- [x] Fix the product code, or isolate the test, without weakening any assertion
- [x] Run the full suite on Windows and Linux (WSLg, on its own)

## Notes

- Root cause: Windows' foreground lock, not state from an earlier test or test order. Windows refuses
  `SetForegroundWindow` to a process that didn't get the user's last input, for `ForegroundLockTimeout` (200 s here)
  after the user's last input in another app. A real tray click, tray-menu choice or Start-menu relaunch gives Featra
  that right. The e2e harness fakes those events (`tray.emit("click")`, the menu item's `click()`, a second launch
  spawned from node), so Featra never got it. Whether the test failed depended on what the person at the desktop was
  doing, which is why it passed alone and failed in some full runs.
- Evidence: probes reading `GetForegroundWindow` showed that, while the user worked in Brave, Featra's window never
  became the OS foreground window after `reveal()` (`show()` + `focus()`), at launch or after Show Featra. The baseline
  failure (29/30 in 4 runs) was the sibling test "launching Featra again…", which uses the same `reveal()`.
- `BrowserWindow.isFocused()` is Chromium's own active state, not the OS foreground. It said true in most runs while
  Brave was in front, and false in a few: the flake. So a passing run didn't prove the window was in front.
- Product path: the user clicked the real tray icon by hand with Featra hidden behind another app, and Featra came to
  the front. The product code is unchanged.
- Fix (test harness, user decision): `e2e/foreground.ts` fakes the foreground right a real click grants
  (AttachThreadInput + AllowSetForegroundWindow through PowerShell Add-Type, Windows only, no npm dependency, not in
  product code). `clickTray`, `chooseTrayItem` and `launchAgain` grant it before the faked event. Featra still has to
  show and focus the window itself. Recorded in decisions.md.
- Regression test: both restore tests now also assert the OS foreground window (`windowInForeground`). Before the grant
  (867ca73), both failed on that assertion with the user working in another app, while `isFocused()` passed. No
  existing assertion was changed, removed or moved.
- Alternatives ruled out in the product: minimize then restore, toggling always-on-top, and `app.focus({ steal: true })`
  don't reliably take the foreground under the lock. Forcing it with a native helper goes against Windows guidelines.
- E2E Windows, with the user working on the desktop: 5 full runs in a row, 30 passed each. An earlier batch had one
  60 s timeout in "close hides the window…" (its trace was overwritten). A 48-call timing run showed no grant hang
  (median 632 ms, max about 1 s). The user32 calls now time out after 15 s with a named error, so a hang there
  would fail as itself.
- E2E WSL Ubuntu WSLg, on its own: 30 passed (09e79cd). The menu.spec.ts "Edit items" paste flake did not recur.

## Tests

- AC1: `apps/desktop/e2e/tray.spec.ts` "the tray's Show Featra and a tray click restore and focus the window" and
  "launching Featra again shows the running app's window…" (the `windowInForeground` assertions, red at 867ca73);
  harness `apps/desktop/e2e/foreground.ts`, `apps/desktop/e2e/app.ts`
- AC2: `apps/desktop/e2e/tray.spec.ts` "the tray's Show Featra and a tray click restore and focus the window" (full
  Windows suite, 5 runs in a row)
