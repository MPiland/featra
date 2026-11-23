---
id: STORY-70
type: story
title: Approve merges the feature to main
status: New
parent: FEAT-9
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, one Approve on the approval screen accepts the feature and merges it to main, and I always see why when I can't.

## Acceptance criteria

- [ ] Approve records my Accept on the feature and merges it to main in one click
- [ ] Approve is disabled until every story is Done or Cancelled and the merge is clear; the reason shows beside it, using the existing order (stories, conflicts, behind, no PR, PR closed, remote ahead, base busy, checks)
- [ ] The feature card pane's separate Accept and Merge buttons are replaced by a link to the approval screen
- [ ] If the merge fails after my Accept, the Accept stands, the screen says why, and a "Merge to main" retry appears; when main has moved, the Dev Lead is told to merge main in, as today
- [ ] After the merge, the feature shows Done and the screen shows it merged, with any leftover notes

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-23. Approve combines the two clicks ADR 0037 describes; the merge rules themselves don't change (merge commit, at the commits it was judged at, never rebase).

## Depends on

- STORY-69 Review a feature on one screen
