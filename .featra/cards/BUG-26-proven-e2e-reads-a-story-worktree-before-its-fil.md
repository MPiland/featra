---
id: BUG-26
type: bug
title: Proven e2e reads a story worktree before its files are checked out
status: New
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-16T00:47:09Z
history:
  - at: 2026-11-16T00:47:09Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

`apps/desktop/e2e/ci-proven.spec.ts` waits for the `featra/story-*` branch to exist, then reads the story
worktree's `.featra/cards` (`linkTests`, line 73). `git worktree add -b` creates the branch before its checkout
finishes, so the read can come too early and fail with ENOENT.

Seen on Windows CI in run 43780888271, attempt 1 (PR #58); the rerun passed.

## Acceptance criteria

- [ ] The spec waits for the worktree's cards folder (or the card file), not the branch

## Tasks

## Notes

Found while watching BUG-24 and BUG-25's CI (PR #58). Not fixed there.
