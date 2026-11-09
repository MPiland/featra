---
id: BUG-4
type: bug
title: Intermittent WSLg e2e failures
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
created: 2026-11-06T19:18:27Z
history:
  - at: 2026-11-06T19:18:27Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-07T15:54:44.804Z
    field: status
    from: New
    to: In Progress
    by: user
  - at: 2026-11-09T02:37:47Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-4
  - at: 2026-11-09T03:31:05.573Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-09T03:31:05.573Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

Two e2e tests have each failed once on WSLg (Ubuntu), with nothing else running. Neither failure has come back when retried, and neither has a known cause. Neither is traced to the feature in progress, so this is on the project bug list.

- `apps/desktop/e2e/contrast.spec.ts` "AC4: theme follows the OS and meets WCAG AA › dark" failed once on `feature/13-app-shell` at dad8ef5. That was the first run after `pnpm install` and a rebuild. Its error wasn't kept. Since then it has passed 3 times on its own and in 4 full runs.
- `apps/desktop/e2e/menu.spec.ts` "Edit items act on the focused field" failed once on STORY-19's branch: Paste gave "ehello menul". That was 1 of 31 runs on that branch, against 0 of 28 on main.

## Acceptance criteria

- [x] tray.spec:75 (Show Featra) is reproduced, with its cause recorded in Notes, and its product bug has a regression test that fails before the fix. menu Edit/Paste, contrast dark and tray.spec:220 (launch again) are each closed as not reproducible: none failed in the CI soaks (Windows tray 1350/1350, run 42509370525; Ubuntu 720/720, run 42509375532) or in any local run. If one recurs, CI keeps its trace and it gets its own bug card.
- [x] All four tests in Notes and Description (contrast dark, menu Edit/Paste, tray.spec:75 Show Featra, tray.spec:220 launch again) pass in 20 full Linux runs in a row (Ubuntu, Xvfb with a window manager, on CI), and the tray tests pass 150 Windows runs on CI, with their assertions unchanged.

## Tasks

- [x] Run the full WSLg suite repeatedly, including right after a fresh install and build, keeping traces of failures
- [x] Fix the cause, in the product or in the test's isolation, without weakening any assertion

## Notes

- 2026-11-06 (STORY-2 review): `menu.spec.ts` "Edit items act on the focused field" failed again on WSLg, 1 of 4 runs.
- 2026-11-06 (STORY-2 review, Windows): `tray.spec.ts:220` "launching Featra again shows the running app's window"
  failed `windowInForeground` 2 of 7 runs on 94de547, then 0 of 150 on 8a43e99 (the developer's 60 plus 90 of mine).
  Not reproduced. If it comes back, it's likely BUG-2's foreground lock, not WSLg.
- 2026-11-07 (STORY-4 review, WSLg): `tray.spec.ts:220` failed `windowFocused` in every full run (5 of 5), and
  `tray.spec.ts:75` "Show Featra and a tray click restore and focus the window" failed in 2 of 5. Both fail just as
  often on c5d7a9e (before the sizing fix) as on 4cb0685: tray.spec ×3 gave 4 failures on each. The same build passed
  35 of 35 twice the day before, so this looks like WSLg focus state, not a code change.
- 2026-11-07 (session:bug-4) — status of the fix. Commits on `claude/bug-4-wslg-flakes-592641`: 2abad80, 2633acc,
  2c04ea6, 668996d, c0c7c5a.
  - **tray.spec:75: cause found and fixed (product bug).** Under WSLg every window is also a Windows window, drawn by
    msrdc.exe. `minimize()` minimises it on the Windows side while Electron and X still report it shown, not minimised
    and focused. `focus()` on a shown window doesn't get past a Windows app in front either. So the tray's Show Featra
    and a second launch couldn't bring it back. The old foreground check read X's `_NET_ACTIVE_WINDOW`, which passed
    by luck, so the test was flaky rather than red. Fix (2c04ea6): under WSLg (`onWslg`), `reveal` hides a shown window
    before showing it again; only a fresh show takes the Windows foreground. The trade-off is in decisions.md: on WSLg
    the taskbar button can blink. The harness (2abad80, 2633acc) now checks the Windows foreground window too.
    Red/green: before the fix, tray ×3 failed tray:75 3 of 3 at line 105; after it, tray ×5 passed 45 of 45. Unit
    tests are in `apps/desktop/test/lifecycle.test.ts`.
  - **tray.spec:220:** the same reveal path, now hardened. It passed every run today, including before the fix; the
    earlier 5-of-5 failures weren't reproduced.
  - **WSLg: 20 of 20 full suites in a row at 668996d**, 36 of 36 each (720 tests), covering all four tests.
  - **menu Paste and contrast dark: not reproduced in 45+ runs** (5 baseline full suites, 15 isolated runs each and the
    20 verification suites). No traces survive from the original sightings. Not fixed; whether to close them as not
    reproducible is the Dev Lead's call to the user.
  - **Windows, tray.spec ×5 at 668996d:** blocks 1–5 passed, 45 of 45 each, so **25 clean runs per test**. From block 6
    (about 10:53) to block 26 every block failed tray 42, 75, 151, 186 and 221 in the harness's setup, with "Could not
    grant … the foreground (AllowSetForegroundWindow)" or "The busy-user window didn't come to the front in 5 s". The
    run then recovered at about 14:46, within a minute of the user coming back to the PC: run 27 crashed with
    0xC0000142, run 28 couldn't start npx (exit 127), runs 29 and 30 passed. **The cause of the 10:53–14:45 breakdown is
    unconfirmed.** It wasn't a lock or sleep, and the monitor stays on. A leak was ruled out: timed-out tests leave
    nothing behind, a planted orphaned busy-user window didn't reproduce it, and process, handle and window-object
    totals stayed flat over 4 blocks. In a later diagnostic at 15:27 (block 3 of 3, user present) grants failed while
    GameInputSvc (a SYSTEM process, whose window blocks injected input) was in front. The user says GameInput/Steam
    wasn't in play during the breakdown, so that sighting doesn't explain it. Also unexplained: a
    `playwright test … tray.spec.ts --repeat-each…` run (pids 48684 and 49968) was alive in this worktree at about
    15:05, after the loop's own record shows its 30 runs ended at 14:48:46. Neither this session nor the Dev Lead
    started it; it was stopped.
  - **Harness, c0c7c5a:**
    - A grant or busy-user failure now names what's in front: the lock screen or a UAC prompt, an elevated window, or
      a SYSTEM or protected window, with integrity levels and the time since the last input.
    - Global setup refuses to start beside leftover harness processes or on a desktop that blocks the harness's
      input.
    - Global teardown fails the run if Featra or a helper outlives it. Proved with a planted orphan: teardown failed,
      and the next run refused to start.
    - The busy-user window ends with its worker.
    - Verification loops stop at the first failing block.
  - **Still open:** the Windows tray 150-run check (25 of 150 done), and running global setup once under WSLg (not yet
    exercised there). Testing is paused by the user.
- 2026-11-07 (session:bug-4): **Blocked by STORY-43 "Every PR runs CI on Windows and Ubuntu" (FEAT-18).** The user
  decided (decisions.md, 18013d9) that WSLg was only a test stand-in, not a supported platform: Linux runs move to
  Ubuntu under Xvfb with a window manager, and the soak runs move to GitHub Actions. AC2 now asks for those CI runs.
- 2026-11-08 (session:bug-4): **AC2 proven on CI at 10aff67** (the branch with main merged in), assertions unchanged,
  `--max-failures 1`:
  - Windows, `soak/windows/tray/150`, run 42509370525: tray.spec `--repeat-each 150`, **1350 of 1350 passed** (9 tests
    × 150) in 24.6 min on windows-2025.
  - Ubuntu, `soak/ubuntu/all/20`, run 42509375532: the full suite under Xvfb `--repeat-each 20`, **720 of 720 passed**
    (36 tests × 20, all four tests included) in 15.7 min on ubuntu-24.04.
  - PR MPiland/featra#5 (run 42509394777): Gate, E2E (Windows) and E2E (Ubuntu) passed. The new global setup's
    desktop check passed on the Windows runner.
  - **AC1 isn't met:** tray:75 was reproduced and fixed, but menu Paste, contrast dark and the earlier tray:220
    failures never came back, here or on CI, so their causes aren't known. The card stays In Progress until the user
    decides whether to close them as not reproducible or to change AC1.
- 2026-11-08 (user changed AC1; card history has no field for an AC change, so it is recorded here): menu Paste, contrast dark and tray.spec:220 close as not reproducible; AC1 is reworded to say so.
  BUG-6 was fixed first (merged to main at f2de028, merged here at ce54529). BUG-4 moves to In Review.
