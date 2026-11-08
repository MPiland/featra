---
id: BUG-5
type: bug
title: Unit tests time out under load
status: Done
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-5-fix
pr: https://github.com/MPiland/featra/pull/3
created: 2026-11-07T21:37:53Z
history:
  - at: 2026-11-07T21:37:53Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-07T21:10:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-5
  - at: 2026-11-08T06:12:40Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-5
  - at: 2026-11-08T14:42:20.503Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-08T14:42:20.503Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

Two unit tests failed the pre-commit `pnpm check` once on 2026-11-07, on BUG-4's branch, during a commit that touched only a card. A retry passed 636 of 636. Each is a timeout, which suggests timing flakiness under load.

- `tooling` `check.test.ts` "format:check flags the file" hit its 5 s timeout.
- `packages/server` `ws-work.test.ts` "applies a stale copy" got no frame within 2000 ms.

## Acceptance criteria

- [x] Each failure is reproduced under load (for example `pnpm check` alongside an e2e run, or vitest with high parallelism), and its cause is recorded in Notes.
- [x] Each test passes 50 runs in a row under that load, with its assertions unchanged. Any time limit that changes is justified in Notes, not raised just to pass.

## Tasks

- [x] Reproduce under load and keep the output
- [x] Fix the cause (test isolation, waiting on a real event instead of a fixed time, or the product)

## Notes

- 2026-11-07 (Dev Lead): `ws-work.test.ts` failed again with "No matching frame in 2000 ms" on main at 0223de8, during the pre-commit check for this card. No e2e or other session test run was going at the time, so load from e2e isn't needed to trigger it.
- 2026-11-07 (BUG-5 Developer): **Cause: a product race in `work-watch.ts` `observe()`, not load.** Reproduced 5 of 5 on an idle WSL Ubuntu (Node 24.22.2) and on every CI Gate run: `ws-work.test.ts` card.watch gets "No matching frame in 1000 ms".
  - **How it happens.** The AC6 test closes its socket and the card.watch test opens a new one on the same folder. The server sees the close only after `card.watch` has joined the folder's existing watch entry. `observe()` awaited the first scan before it added its listener. Meanwhile the old socket's `stop()` saw no listeners, ended the entry and closed every file watcher. The new listener was then added to a dead entry, so it never heard an edit. A trace of watcher events showed no new `fs.watch` calls after the join, and file events stopped reaching the entry.
  - **In the app.** This hits any pane or list that starts watching a folder while another watch on that folder is ending. Its live updates stop with no error.
  - **The other suspects, checked.** `fs.watch` itself is fine: on Linux a recursive watch reports an edit in 2–4 ms even when the edit comes right after the watch starts. A race between subscribing and the first edit: no, because the push arrives once the entry is alive. Git subprocess time: one scan takes 200–270 ms on idle Windows (one git spawn takes about 30 ms) and 450–800 ms under the full parallel unit run. That is slow but inside the 1 s budget, and Linux is faster. Test isolation: card.watch relies on the state the work.watch tests leave behind, and that ordering is what exposed the race. The test's assertions and order are unchanged.
  - **Fix.** `observe()` adds its listener before the first scan and ignores scans until it has its own answer, so the entry can't end under a listener that is joining. The regression test is `packages/server/test/work-watch.test.ts`. It joins while the last other listener stops, then edits. Before the fix it fails on Windows and on WSL with "No list in 1000 ms"; with the fix it passes.
  - **Windows under load: a second cause, git start-up time.** In the full unit run, each git process takes about 200 ms on average and up to 1.9 s, against about 30 ms idle, so one scan (about four git calls in series) takes 1.5–2.7 s. That holds even at 28% CPU with nothing else of ours running, and with `tooling` left out: the suite's own parallel workers are enough. The push tests (STORY-3 AC5 and AC6, the card.watch push, and the regression test) then miss their 1 s and 2 s budgets on Windows. Linux is unaffected (WSL: 50 of 50 full runs passed). `branches()` now runs its two `for-each-ref` calls side by side, which removes one git call from the chain.
  - **Time limit changed: vitest's per-test timeout, 5 s → 30 s** (`--testTimeout=30000` in `test:unit`), because the per-project configs don't inherit a root `testTimeout`. The 5 s default only catches hangs; it isn't a product limit. Measured under load on this PC, tests with no timing criterion took: whole-repo `pnpm lint` 10.3 s, format check/fix 7.4 s, copy-actions 9.3 s, and a jsdom menu test 5.08 s (WSL). On an idle CI runner each takes about 3 s or less. 30 s is about 3× the worst seen and still catches a hang. **No product time limit changed**: the 1 s and 2 s push budgets stand.
- 2026-11-07 (BUG-5 Developer): **Speed fix, chosen by the user ("Fix speed in BUG-5").** A rescan now reuses git's answers from the watch's last scan, so a card edit runs no git. Git runs again after an event on `HEAD`, `packed-refs`, `refs/heads` or `worktrees`, after a watcher error or a failed scan, after `refresh` (the server's own writes), or when the config's base branch changes. ADR 0016 is amended with this scan model and the reasons for it.
  - **Tests.** In `work-watch.test.ts`, "rescans a card edit from disk alone" wraps the real `createRepoGit()` to count calls and expects none after a card edit. It fails without the reuse, with `paths`, `worktrees` and other calls. "asks git again when a branch changes" re-creates a feature branch ref and expects its card. That test waits 5 s, because a full git rescan isn't covered by STORY-3's 1 s for card edits.
  - **Measured, Windows, full parallel `pnpm test:unit`.** Before: 1.5–2.7 s per scan on a card edit, and STORY-3 AC5, AC6 and card.watch failing. After: disk-only rescans took 26 ms on average, 28 ms median and 43 ms max (n = 8). Full git scans took 619 ms on average and 911 ms max (n = 9). 633 of 633 passed. STORY-3 AC5 (1 s) and AC6 (2 s) are unchanged.
  - **The 30 s vitest timeout was allowed by the user ("Allow 30 s").** The justification and measurements are in the note above.
- 2026-11-07 (BUG-5 Developer): **Soaks after the speed fix.** Local Windows under normal load: 50 of 50 full `pnpm test:unit` runs passed. CI Ubuntu: 50 of 50 passed. CI Windows failed on run 1 in `tooling/test/pre-commit-hook.test.ts`, with "git does not resolve to the temp repository". On the runner, `tmpdir()` is an 8.3 short path (`RUNNER~1`). Git reports the long path, and JS `realpathSync` doesn't expand short names, so the safety guard tripped. Reproduced here with `TMP` set to an 8.3 name. Fixed with `realpathSync.native`; the guard itself is unchanged.
  - **Still tight under double load.** With two full unit suites running at once, STORY-3 AC6 missed its 2 s once: Apply runs its own full scan, a `git restore` and a full `refresh`. It passed 3 of 3 runs alone and 50 of 50 in the soak under normal load.
- 2026-11-08 (BUG-5 Developer): **50 runs in a row, final.** Local Windows (normal load): 50 of 50. CI soak run 42450475476: Ubuntu 50 of 50, Windows 50 of 50. PR #3 into `claude/story-43-ci-e105f9`: Gate, E2E (Ubuntu) and E2E (Windows) green. Not merged.
