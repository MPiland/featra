---
id: BUG-26
type: bug
title: Proven e2e reads a story worktree before its files are checked out
status: Acceptance
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-26-proven-e2e-race
pr: https://github.com/MPiland/featra/pull/59
created: 2026-11-16T00:47:09Z
history:
  - at: 2026-11-16T00:47:09Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-16T02:01:45Z
    field: status
    from: New
    to: In Progress
    by: session:bug-26
  - at: 2026-11-16T02:20:21Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-26
  - at: 2026-11-16T02:20:21Z
    field: pr
    from: null
    to: https://github.com/MPiland/featra/pull/59
    by: session:bug-26
  - at: 2026-11-16T02:45:46Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

`apps/desktop/e2e/ci-proven.spec.ts` waits for the `featra/story-*` branch to exist, then reads the story
worktree's `.featra/cards` (`linkTests`, line 73). `git worktree add -b` creates the branch before its checkout
finishes, so the read can come too early and fail with ENOENT.

Seen on Windows CI in run 43780888271, attempt 1 (PR #58); the rerun passed.

## Acceptance criteria

- [x] The spec waits for the worktree's cards folder (or the card file), not the branch (test: apps/desktop/e2e/ci-proven.spec.ts::Name CI's test report, and a story's PR checks finishing prove its criteria from it; apps/desktop/test/story-card.test.ts)

## Tasks

## Notes

Found while watching BUG-24 and BUG-25's CI (PR #58). Not fixed there.

Fix: a shared e2e helper, `awaitStoryWorktree(dir, slug)` in `apps/desktop/e2e/story-worktree.ts`, waits for the
branch and then for the story's card in the worktree to exist, parse and name the story's branch (`startedCard` in
`apps/desktop/e2e/story-card.ts`). Start writes that card with `writeAtomic` after `git worktree add` returns, so it is
the last thing Start does on disk: the checkout is done and nothing will write over the spec's edit.
`ci-proven.spec.ts` (AC1) now edits that file. The same branch-then-read was in `abandon-story`, `merge-story` (they
commit in the worktree at once), `start-story` (`existsSync(folder)` at once) and `accept-story`, `local-checks`,
`stop-resume-story`, `story-notice`, `story-pr`; all use the helper now. `storyOf(dir, slug)` is the shared lookup of
the branch, ID and folder, used by the helper and `update-card`.

The e2e race itself can't fail first on demand: it is a timing window on Windows CI, and Electron e2e runs in CI only.
The wait condition can, so `apps/desktop/test/story-card.test.ts` tests it: no cards folder, a longer ID with the same
prefix, the checked-out copy (`branch: null`) and a half-written card all count as not ready; the card naming the
branch does. Each case fails when its check is broken on purpose.

The product doesn't lose writes this way, though a scan can land in the window. `git worktree add` writes the new
worktree's HEAD before it checks out, and the watch fires on it; `branchStateOf` falls back to the ID in a story
branch's name, so the half-made worktree already owns the card. Writes are safe because every card writer shares one
card lane, and Start holds it across the worktree add and the card write; queued actions rescan first. What a scan in
the window can show, for one scan: "isn't in its owner", "Can't read …" (owner unread, so actions refuse), or the
pre-Start status. All cosmetic; hiding it is on the roadmap.
