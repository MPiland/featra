---
id: STORY-61
type: story
title: Hold a story back from auto-merge
status: New
parent: FEAT-8
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-16T12:00:00Z
history:
  - at: 2026-11-16T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I hold one story back from merging on its own, so I can look at it first, and merge it myself when I'm ready.

## Acceptance criteria

- [ ] Hold is a toggle on a story in its card pane and its Work row while auto-merge is on; turning it on or off is recorded in the card's history
- [ ] A held story never merges on its own; Merge still works on it
- [ ] Turning Hold off lets a story that is already Verified and Proven merge on its own
- [ ] Hold is shown on the story row so a held story is easy to spot

## Tasks

- [ ] Rules in work-format: the hold field or history event, and the auto-merge rule honours it
- [ ] Server: set and clear Hold at the owner's copy; the observer skips held stories and checks a story again when Hold is cleared
- [ ] Client: the Hold toggle in the card pane and Work row, and a held mark on the row
- [ ] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Notes

Shaped with the user on 2026-11-16.

## Depends on

- STORY-59 Merge a proven story on its own
