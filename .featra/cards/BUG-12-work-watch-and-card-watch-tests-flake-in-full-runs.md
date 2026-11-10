---
id: BUG-12
type: bug
title: Work-watch and card-watch tests flake in full runs
status: In Review
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-12-watch-flakes
pr: https://github.com/MPiland/featra/pull/24
created: 2026-11-09T12:00:00Z
history:
  - at: 2026-11-09T12:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-10T10:00:00Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-10T13:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
---

## Description

During STORY-7 on 2026-11-09, the pre-commit `pnpm check` failed on Windows in full runs. Each failing test passed when run alone, and the commit passed on retry:

```
FAIL |@featra/server| test/work-watch.test.ts > work watches > asks git again when a branch changes
Error: No list in 5000 ms
FAIL |@featra/server| test/ws-work.test.ts > card.watch and card.update (ADR 0017) > answers with the card, pushes it on an outside edit, and saves an edit to the owner
Error: No matching frame in 2000 ms
```

In one other run, `card-actions.test.ts` and `copy-actions.test.ts` failed together. That run may have been disturbed by a killed test loop, so treat it as unconfirmed. BUG-5, BUG-6 and BUG-7 found similar waits under load.

## Acceptance criteria

- [x] Each failure is reproduced under load and its cause is recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] Each test passes 50 full runs in a row under that load (under the capped gate: 3 workers), with its assertions unchanged. Any time limit that changes is justified in Notes.

## Tasks

- [x] Reproduce under load and keep the output
- [x] Find the cause of each failure and fix what the repo can fix (one product race, test waits, test wiring)
- [ ] Soak each test 50 full runs in a row under load: not met, see Notes (a host stall outlasts any wait)

## Notes

- 2026-11-10: seen on CI (Gate, Ubuntu), run 42745135063, on STORY-22's card-only commit 3c4f6d4. Three `ws-work.test.ts` tests failed together. The first was "work.watch > answers with the list, then pushes it within 1 s of an owner file edit (STORY-3 AC5)", with "No matching frame in 2000 ms". After it, "applies a stale copy" failed with `git commit -q -m titles` exiting 1 ("On branch main"), and card.watch failed to match. The later two may cascade from the first test's leftover state in a shared repo.
- 2026-11-10: seen again while building STORY-51 (PR #23): the pre-commit `pnpm check` failed more than 3 times in a row on one worktree, on timing tests in `ws-work.test.ts` and the watch tests (`work-watch.test.ts`). Each passed when run alone. The commit passed only after repeated retries, so the flake now costs several 80 to 110 second runs per commit.
- 2026-11-10 (developer): reproduced. Baseline: 3 of 3 full `pnpm test:unit` runs failed (about 132 s). Harness: `vitest run --testTimeout=30000 --project @featra/server` on `ws-work`, `work-watch` and `card-actions-draft`, one run per iteration, with 12 busy worker threads beside it. The old code passed 0 of 5. Log lines: AC5 "No matching frame in 2000 ms", the branch test "No list in 5000 ms", "Not seen in 20000 ms", card-actions-draft 32 s.
- 2026-11-10: causes. (1) The PC runs out of memory during a full run (available 200 to 500 MB, 30,000 to 95,000 pages/s; before it, WSL held 7.3 GB and Windows' kernel pools 11.5 GB of 15 GB). Windows git starts took a median of 240 ms (47 ms idle) and up to 9 to 15 s in a full run, Defender (MsMpEng) was at 100 to 270% of a core, and process creation sometimes stalls 20 to 40 s for every worker at once (a probe's `git --version` took 29 s). A stall fails the one test of each file whose wait it falls in. A missed file event is not the cause: a trace shows the events arrive and the rescan waits on git. (2) AC5, AC6 and card.watch are one failure: AC5's first `work.watch` answer is a full scan (five serial git rounds) on the 2 s default wait; AC5 then never edits, so AC6's `git commit` has nothing to commit and card.watch finds STORY-1 on main. (3) card-actions-draft ran a full scan per action because its actions had no watch; the server gives them one. (4) Product race: an edit made after a watch's first scan read the files and before the watchers started was heard by nobody. Fixed in `work-watch.ts`; `work-watch-late.test.ts` fails before the fix (timed out) and passes after. ADR 0016 amended.
- 2026-11-10: changed time limits, no assertion changed. `FIRST_ANSWER_MS` 20 s (was 2 s default or 10 s) on the three first-scan answers in `ws-work` and the draft door checks: STORY-3 times only the push after an edit. The branch-change wait 5 s to 20 s (`GIT_ASKED_MS`, no criterion times it). Unchanged: AC5's 1 s wait and its `< 1000` assertion, and the AC6 and card push waits.
- 2026-11-10: not met. Second AC: the fixed code passed 35 of 50 runs of the harness. All 15 failures were in runs of 53 to 76 s (normal 27 s) and were one of three waits (`card-actions-draft` beforeEach or "refuses a move out of draft", `work-watch` "a worktree goes", `ws-work` draft door check) that a stall of 20 s or more outlasts. A full gate still lost one test in each of nine files at once (30 to 36 s each). Worker caps of 8 and 4 did not cure it, so none is committed. Ruling (the user): the pre-commit gate caps vitest at 3 workers (`VITEST_MAX_WORKERS`, overridable); the PC's memory pressure is the underlying cause and remains. Counts under the capped gate follow below. See decisions.md. Gate runs on the fixed code (the pre-commit hook script): run 1 passed in 156 s, run 2 failed in 185 s (card-actions-draft, card-actions, copy-actions), run 3 failed in 163 s (ws-work card.watch on its 20 s first answer, and the pre-commit-hook test hook timeout), both on the same stall; before the fix 3 of 3 failed at about 132 s.
- 2026-11-10: capped results (3 workers). Gate: 4 of 5 runs passed (261, 233, 231, 257 s); the fifth (271 s) failed on one multi-file stall. Soak: stopped after 8 runs with 6 passing; failures were 20 s or longer process-creation stalls (run 8: card.watch "No matching frame in 2000 ms", 59.5 s run). AC2 stays unticked; the underlying cause is the PC's memory pressure (WSL 7.3 GB, kernel pools 11.5 GB of 15 GB).
