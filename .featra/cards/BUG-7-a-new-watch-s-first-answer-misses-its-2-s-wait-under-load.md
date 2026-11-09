---
id: BUG-7
type: bug
title: A new watch's first answer misses its 2 s wait under load
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
created: 2026-11-08T21:05:38Z
history:
  - at: 2026-11-08T21:05:38Z
    field: status
    from: null
    to: New
    by: session:bug-6
  - at: 2026-11-09T01:43:22Z
    field: status
    from: New
    to: Done
    by: session:bug-6
---

## Description

`packages/server/test/ws-work.test.ts` "card.watch and card.update (ADR 0017)" failed 2 of 50 full `pnpm test:unit` runs on Windows during BUG-6's AC2 soak at ad90471, with "No matching frame in 2000 ms". AC6 passed in all 50. The wait that failed is almost surely `card.watch`'s answer, which is a new watch's first full scan. The test's three `card.update` waits run no git, as `services-git.test.ts` proves. A first scan runs three serial git rounds: `rev-parse`; worktrees and branches side by side; one `cat-file --batch`. Under the full run each git start takes 150–1100 ms, so three rounds can pass 2 s. BUG-6 cut the rounds from four to three and timed the first answer at 0.8–1.0 s in most runs.

## Acceptance criteria

- [x] The failing wait is confirmed by timing under the full parallel unit run, and the cause is recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [x] The test passes 50 full `pnpm test:unit` runs in a row on Windows, with its assertions and its 2 s waits unchanged.

## Tasks

- [x] Time each git round of a new watch's first scan under the full unit run
- [x] Fix the cause without weakening the test (no product fix needed)

## Notes

- Found by BUG-6's AC2 soak: runs 38 and 42 of 50. One idea to check: run `paths`, `worktrees` and `branches` side by side from the opened folder, since the base branch is known before `top` in most projects. That would make the first scan two rounds.
- 2026-11-08, the pre-commit hook for BUG-6's fixes, after ad90471: STORY-3 AC5 failed with "No matching frame in 2000 ms" on its `work.watch` answer, the very first scan of the test repo. That is the same cause on another test. The tests after it in the file then failed in turn: AC6 at `git commit -m titles`, since AC5 stopped before its edit, and `card.watch`, which got main's untitled copy. So this flake can also fail the hook.

- Timed through BUG-6's timing soak at 84adbdc (2026-11-08): `card.watch` failed in 6 of 50 local runs. Each time it was the new watch's first answer. In 5 runs, one git step in that process took 1.6–6.2 s while git in the other test processes took under 1 s. In run 20 it was a 4.4 s stall in which no git returned in any process. A first scan in 2 git rounds saves about 0.2 s and would have saved at most one of those runs. So the cause is the local PC, not a product bug, and there's no regression test. BUG-6's Notes have the timings.
- Closed through BUG-6: the Windows soak at a567a1e (https://github.com/MPiland/featra/actions/runs/42542436037) ran 50 full `pnpm test:unit` runs in a row on CI's `windows-2025` runner, the place the user chose for AC2 soaks. All 50 passed, `card.watch` included, with its assertions and 2 s waits unchanged. Moved to Done by the BUG-6 session as the Dev Lead decided. The user's Accept is still open (`requireAccept`).
