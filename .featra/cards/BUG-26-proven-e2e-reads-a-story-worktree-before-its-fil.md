---
id: BUG-26
type: bug
title: Proven e2e reads a story worktree before its files are checked out
status: In Progress
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-26-proven-e2e-race
pr: null
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
---

## Description

`apps/desktop/e2e/ci-proven.spec.ts` waits for the `featra/story-*` branch to exist, then reads the story
worktree's `.featra/cards` (`linkTests`, line 73). `git worktree add -b` creates the branch before its checkout
finishes, so the read can come too early and fail with ENOENT.

Seen on Windows CI in run 43780888271, attempt 1 (PR #58); the rerun passed.

## Acceptance criteria

- [x] The spec waits for the worktree's cards folder (or the card file), not the branch (test: apps/desktop/e2e/ci-proven.spec.ts::Name CI's test report, and a story's PR checks finishing prove its criteria from it)

## Tasks

## Notes

Found while watching BUG-24 and BUG-25's CI (PR #58). Not fixed there.

Fix: a shared e2e helper, `startedStory` in `apps/desktop/e2e/story-worktree.ts`, waits for the branch and then for
the story's card in the worktree to exist, parse and name the story's branch. Start writes that card after
`git worktree add` returns, so it is the last thing Start does on disk: the checkout is done and nothing will write
over the spec's edit. `ci-proven.spec.ts` (AC1) now edits that file. The same branch-then-read was in
`abandon-story`, `merge-story` (they commit in the worktree at once), `start-story` (`existsSync(folder)` at once)
and `accept-story`, `local-checks`, `stop-resume-story`, `story-notice`, `story-pr`; all use the helper now.

No regression test fails first: the race is a timing window on Windows CI that a spec can't open on demand, and
Electron e2e runs in CI only. The wait now polls the file itself, so a slow checkout makes the spec wait (up to
30 s), not fail.

The product doesn't race this way: Start reads the card from the scan and writes the worktree only after
`git worktree add` returns, and a scan makes a worktree the owner only when a card there parses and names its branch.
