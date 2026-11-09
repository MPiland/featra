---
id: BUG-6
type: bug
title: Stale-copy Apply misses its 2 s push under load
status: In Progress
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-6-stale-copy-8622e4
pr: null
created: 2026-11-08T16:00:00Z
history:
  - at: 2026-11-08T16:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-08T19:25:32Z
    field: status
    from: New
    to: In Progress
    by: session:bug-6
---

## Description

`packages/server/test/ws-work.test.ts` "applies a stale copy and pushes the list without it (STORY-3 AC6)" failed the pre-commit `pnpm check` once on 2026-11-08, on `feature/18-tests-run-on-ci` at 1312465 (after the BUG-5 fix), with "No matching frame in 2000 ms". Nothing else of ours was running. It then passed 5 of 5 runs of that file alone. BUG-5's notes already said AC6 was tight: Apply runs its own full scan, a `git restore` and a full `refresh`.

## Acceptance criteria

- [x] The failure is reproduced under the full parallel unit run, the slow step is measured, and the cause is recorded in Notes. If the cause is a product bug, a regression test fails before the fix.
- [ ] The AC6 test passes 50 full `pnpm test:unit` runs in a row on CI's Windows runner, with its assertions and its 2 s wait unchanged.
- [x] The `card.watch` stale "Unwatched" answer is explained. Either it is shown to follow only from the AC6 test failing before Apply finishes, since the tests share one repo and run in order, or it is logged as its own bug card (BUG-7) with its cause.

## Tasks

- [x] Reproduce under the full unit run and time each step of Apply
- [x] Fix the cause without weakening the test

## Notes

- Not traced to the feature in progress (STORY-3's code is in main), so this is on the project bug list.
- 2026-11-08, on the BUG-4 branch at 10aff67 with only card edits, while the user was using the PC: "applies a stale copy" failed in 3 of 4 full `pnpm test:unit` runs in the pre-commit hook with "No matching frame in 2000 ms" (`ws-work.test.ts:56`). A standalone run between them passed 645 of 645. Two of those runs also failed `card.watch and card.update (ADR 0017)` at `ws-work.test.ts:151`: card.watch answered STORY-1 with title "Unwatched" instead of "Edited in main".
- AC1, reproduced: the pre-commit hook failed on AC6 in 4 of 5 tries of this card's first commit. The fifth passed only because the fix was already in the working tree. AC6 also failed 7 of 7 full `pnpm test:unit` runs. Each git call was timed with a temporary log, since removed. Under the full run, one git start takes 150–1100 ms. Apply ran about 9 of them in series: a 4-round scan, the restore, then `refresh` forcing a full git rescan. So the `work.applyCopy` answer came 2.1–3.3 s after the request. The fresh `work.watch` answer took 4 rounds, 1.2–2.6 s, and missed the wait in 1 of 7 runs.
- AC1, cause: a product bug. Writing a card file and `git restore` move no ref, HEAD or worktree, so the git work around Apply, Discard and card edits was not needed. The regression test `packages/server/test/services-git.test.ts` failed before the fix: Apply ran 10 git calls, not just `restore`, and `card.update` ran 10 instead of none.
- AC1, fix: Apply, Discard and `card.update` scan through the watch (`WorkWatches.scan`) before and after they write, and reuse its git part unless a git target fired. A fresh scan reads every rev's `.featra/cards` tree and the missing blobs through one `git cat-file --batch` (`git-batch.ts`, tested in `git-batch.test.ts`). That is 3 git rounds, not 4. After the fix, in full runs, the watch answer takes 0.8–1.0 s and Apply 0.35–0.7 s. The assertions and the 2 s wait are unchanged. ADR 0016 and ADR 0017 are amended, and decisions.md has an entry.
- AC3: the "Unwatched" answer follows from AC6 failing first. Before the fix, in 11 runs that failed AC6, `card.watch` failed 5 times. It never failed in a run where AC6 passed, and it never failed in the 12 runs after the fix. "Unwatched" is STORY-1 as the `titles` commit has it, checked out in the story-1 worktree, which owns it. When AC6 times out before `work.applyCopy` is sent or answered, the next test reads the owner before Apply writes "Edited in main" there. In the other form, `card.watch`'s own answer misses its 2 s; that is the same slow fresh scan. No BUG-7 is needed.
- Reuse when git changes underneath (the Dev Lead's condition): removing a worktree under a watch fired no git target, so the watch kept the old owner. Git deletes `worktrees/<name>` as one folder, which the name filter dropped. Windows also keeps sending events for the removed worktree's deleted `.featra` by its absolute path, and each one reset the settle, so no rescan ran. Fixed in `work-watch.ts`. The regression tests failed before the fix and pass after it: `services-git.test.ts` adds a worktree under the watch, Applies to it, removes it, then edits the card in main; `work-watch.test.ts` removes a worktree, then the last one. ADR 0016 is amended.
- Load flake in setup, not product code: `work-scan.test.ts` `beforeAll` builds its repo with about 25 serial git starts. Under the full run that went over vitest's 10 s default hook timeout in two pre-commit runs. `work-watch.test.ts` `afterAll` waits for the scan in flight and did the same in soak runs 13 and 15. `packages/server/vitest.config.ts` now gives hooks the same 30 s that `test:unit` gives tests. The CLI's `--hookTimeout` doesn't reach workspace projects, though `--testTimeout` does. No assertion or wait changed.
- First soak: the AC6 test passed 50 of 50 full `pnpm test:unit` runs in a row on Windows, at ad90471, with its assertions and 2 s wait unchanged. 48 runs were green. Runs 38 and 42 each failed one other test: `card.watch and card.update (ADR 0017)` with "No matching frame in 2000 ms" while AC6 passed. That is not the "Unwatched" answer (AC3), which never came back. It is the 2 s wait on `card.watch`'s own answer, a new watch's first full scan of three serial git rounds. The three `card.update` waits run no git. This corrects the AC3 note above: that form does happen without AC6 failing. It is logged as BUG-7.
- 30 s stall in the work-watch `afterAll`, traced with a loop of full `pnpm test:unit` runs that logged the open handles. It is a product leak, not test isolation. In the stalled run, `rm` hit EBUSY on `.git/featra/index.sqlite` 39 times. No git process was alive, and no batch reader or git call ran over 3 s. Cause: `watches.close()` ended an entry, but a scan already queued on its chain still ran. It started after `scanner.close()` had waited out the scans in flight and closed the indexes, then reopened the index, and nothing closed it again. Fix: `scanOnce` skips an ended watch. Regression test: `work-watch-handles.test.ts` closes a watch with one scan in flight and one queued, closes the scanner, then deletes the repo with no retries. It failed with EBUSY before the fix.
- In the app, the same leak happens at shutdown. `services.close()` closes the watches, then the scanner, and a queued scan then reopened the index. `process.exit` follows at once and frees the file, so no user saw it. It would also hit any caller that closes the services and keeps running, as the tests do. While the app runs, each index is meant to stay open: unwatching a folder runs the queued scan against the open scanner, and that only wasted a scan. ADR 0016's Index section covers the index lifecycle and is amended: nothing scans after the scanner closes. ADR 0012 sets only where the index lives.
- `gone()` race, fixed but not the cause of the stall: the stalled run started at 15:19:42, before this fix at 15:19:56, and it shows our own index, not a watcher. A late event or error from a closed watcher deleted the newer watcher under the same key, leaving it open and unclosable. Now `gone()` deletes the key only while the map still holds that watcher. The regression test sends a closed watcher's late error, then checks that stopping the watch closes every watcher it opened. It failed before the fix.
- A watch event without a file name now counts on name-filtered git targets, since Node doesn't promise a name. The regression test sends a nameless event on `worktrees` and expects git to be asked again; it failed before the fix. This may explain one 5 s miss of `services-git.test.ts` "edits main's copy once the owning worktree is removed" (loop run 18), but that is not proven.
- Seen once, not yet explained: loop run 15 failed `packages/client/test/components/work-list.test.tsx` "AC1: epics fold their features; a feature opens to its stories > opens a feature to its stories, rows of the same table". The error was `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Cards and the feature list"`, from `getByRole` at `work-list.test.tsx:11` called from line 54. The loop ran the full unit run against a working tree I was editing, and the client test runs no server code. It came back in run 43 of the second soak, so it is logged as BUG-8 with its trace.
- The pre-commit hook was slower than a plain run, and that was part of this bug. With the fixes above, the hook failed 4 of 4 commits on STORY-3 AC5, AC6 and `card.watch`, while `pnpm check` and `pnpm test:unit` run directly passed every time. Neither the hook's `GIT_*` variables nor the temp folder caused it: the full run passed with all of them set and still failed in a hook with all of them unset. The cause is PATH. Git puts its exec-path (`mingw64/libexec/git-core`) first for hooks, and the `git.exe` there has none of git's DLLs beside it. It starts slower: 145 ms against 107 ms idle, 500–870 ms a start under the full run. Timed in the hook, AC5's first `work.watch` answer took 2225 ms over three git rounds. Running the full suite directly with that PATH reproduced the failures. With the exec-path removed in the hook, the first answers took 0.5–0.9 s. The hook now drops git's exec-path from PATH before `pnpm check`. Regression test: `tooling/test/pre-commit-hook.test.ts` runs the real hook and checks that the gate's PATH lacks the exec-path. It failed before the change. ADR 0014 is amended. This is likely why the first sightings came from the hook.
- Which hook ran: each session worktree's `config.worktree` sets `core.hooksPath` to the main checkout's `.githooks`, written next to `longpaths = true` by the desktop app when it creates the worktree. The shared `.git/config` has the relative `.githooks` that ADR 0014 sets. So commits here ran main's hook, which still had the slow PATH. That is host setup, not Featra code, so no card. Commits in these worktrees use `git -c core.hooksPath=.githooks commit`, which runs this branch's full gate. The configs are left alone.
- Second soak, at d28ed25: 47 of 50 full `pnpm test:unit` runs were green. AC6 failed once, in run 31, with "No matching frame in 2000 ms". `card.watch` failed in the same run. The trace doesn't say which of AC6's waits it was. AC2 is not met at d28ed25. `card.watch` alone failed in run 3, which is BUG-7. Client work-list AC1 failed in run 43, which is BUG-8.
- Worktree-removal tests, under load: "asks git again when a worktree goes" failed a hook run once with "Not seen in 5000 ms", like services-git's removal test in loop run 18. I traced 8 copies at once. The removal is heard and the rescan asks git again. But in the failing trace that rescan took 5.6 s, and in another round every `git rev-parse` took about 2.8 s at the same moment in all 8 processes: a stall of the whole PC. The three waits for git to be asked again now allow 20 s (`GIT_ASKED_MS` in `test/until.ts`, with the reason). These tests are new in this PR and no criterion promises a time. A missed event still fails them. Agreed with the Dev Lead.
- Timing soak, at 84adbdc with temporary timing logs (since removed): 44 of 50 runs were green. AC6 failed once, in run 20, on the fresh watch's first answer (2010 ms). Its other waits never failed: apply 169–656 ms, push 0 ms. That run fell in a stall of the whole PC: for 4.4 s no git returned in any of the 8 test processes, then all of them returned within 0.3 s. A first scan in 2 git rounds saves about 0.2 s, so it would still have failed. `card.watch` failed in runs 3, 20, 24, 29, 44 and 49. Each time one git step in that process took 1.6–6.2 s while the others took under 1 s. Fewer rounds would have saved at most run 49.
- 2026-11-08, the user changed AC2: its 50 runs move from this PC to CI's Windows runner, the same as the e2e soaks, with AC6's 2 s wait and assertions unchanged. The local soak failed only on a machine-wide git stall. Card history tracks only status, parent, evidence and accepted, so the change is logged here. decisions.md has an entry.
