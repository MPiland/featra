---
id: STORY-58
type: story
title: Abandon a story
status: New
parent: FEAT-6
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-11T20:00:00Z
history:
  - at: 2026-11-11T20:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I abandon a story I no longer want, keeping its card as Cancelled or discarding it.

## Acceptance criteria

- [ ] Abandon warns when the story's worktree has uncommitted or unpushed work and asks to confirm
- [ ] The user chooses to keep the card as Cancelled (logged in history, left out of counts) or to discard it
- [ ] Abandoning stops the story's session, closes its open PR, and removes its worktree and its local and remote branches

## Tasks

- [ ] Break down when picked up

## Notes
