---
id: BUG-22
type: bug
title: Abandon e2e checks origin's branch before it goes
status: Acceptance
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/accept-bug-21
pr: https://github.com/MPiland/featra/pull/50
created: 2026-11-13T20:40:00Z
history:
  - at: 2026-11-13T20:40:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-13T20:40:00Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
  - at: 2026-11-13T21:00:00Z
    field: status
    from: In Progress
    to: Acceptance
    by: dev-lead
---

## Description

The Windows e2e "Abandon a story: it warns, closes the PR, removes its worktree and branches, and keeps it as Cancelled"
failed twice in a row on PR #50 with origin's story branch still listed. The product is fine; the test checks too early.

## Acceptance criteria

- [x] The test waits for the local and origin story branches to go after the worktree folder does (test: apps/desktop/e2e/abandon-story.spec.ts::Abandon a story: it warns, closes the PR, removes its worktree and branches, and keeps it as Cancelled)

## Tasks

- [x] Poll for the local and origin branches to be gone, as the test already does for the folder

## Notes

Cause: Abandon removes the worktree folder, then the local branch, then origin's branch (`removeBranches` in
`story-abandon.ts`). The test waited for the folder only and then read origin's branches once; on the slower Windows
runner the push that deletes origin's branch had not finished.

Before the fix it failed on CI twice (run 43500291036, attempt 1 and 2), with `Received: "featra/story-1-draft-a-feature"`.
