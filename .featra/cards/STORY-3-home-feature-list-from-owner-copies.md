---
id: STORY-3
type: story
title: Home feature list from owner copies
status: New
parent: FEAT-2
order: 2
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

As a builder, I open Work and see every feature grouped by epic, with each feature's stories underneath, so I know what remains without asking.

## Acceptance criteria

- [ ] Epics are collapsible headers; every feature is a same-level row under its epic, and a feature expands to its story rows
- [ ] Feature rows and story rows share one column grid: Feature/Story, Status/Stage, Progress/Criteria, Tasks, Scope/PR
- [ ] Filter chips narrow the list to All, In progress, Needs review, Backlog or Done
- [ ] Each card is shown from its owning location only (ADR 0002), across all worktrees and branches
- [ ] Editing an owner card file outside the app updates the list within 1 second
- [ ] An edit to a stale copy is flagged on the card with apply-to-owner or discard actions

## Tasks

- [ ] Break down when picked up

## Notes
