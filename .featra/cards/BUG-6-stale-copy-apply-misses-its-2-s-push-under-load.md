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
- [ ] The AC6 test passes 50 full `pnpm test:unit` runs in a row on Windows, with its assertions and its 2 s wait unchanged.
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
