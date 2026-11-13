---
id: STORY-17
type: story
title: Read-only stage board
status: New
parent: FEAT-7
order: 4
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

As a builder, I switch Work to a board of stage columns to spot where stories pile up.

## Acceptance criteria

- [ ] A List and Board toggle in Work's header switches to the board; the choice is remembered per project
- [ ] The board has one column per stage, New through Done, in the project's stage order, each with its count
- [ ] A filter shows all features' stories or one feature's
- [ ] A story card shows its ID and title, a feature tag when all features are shown, its PR chip and a mark when it waits on the user; clicking it opens its card pane
- [ ] Cards cannot be dragged; stages change only through agents, merges and the card pane

## Tasks

- [ ] Break down when picked up

## Notes
