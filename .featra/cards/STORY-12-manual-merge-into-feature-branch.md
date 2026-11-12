---
id: STORY-12
type: story
title: Merge a story into its feature
status: New
parent: FEAT-6
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I merge a Verified story into its feature branch from Featra, or approve the Dev Lead's request to. Accept gates Done, not the merge.

## Acceptance criteria

- [ ] A Verified story shows Merge in its card pane and Work row; merging needs Verified, not Accept
- [ ] Merge uses a merge commit: through the PR on GitHub, or a git merge into the feature branch in local mode; a PR merged on GitHub outside Featra is noticed and handled the same way
- [ ] The Dev Lead can ask to merge with `request_merge`; the user sees a card to approve or decline, and approving merges
- [ ] On a conflict nothing is merged; the story returns to In Progress and its session gets the conflicting files
- [ ] After the merge, card ownership moves to the feature branch, the story's worktree and its local and remote branches are removed, and its chat stays as read-only history

## Tasks

- [ ] Break down when picked up

## Notes

## Depends on

- STORY-11 Story PR and PR chip
- STORY-56 Local checks and where checks run
