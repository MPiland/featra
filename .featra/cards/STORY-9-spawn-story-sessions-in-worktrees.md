---
id: STORY-9
type: story
title: Spawn story sessions in worktrees
status: New
parent: FEAT-5
order: 1
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

Spawn story sessions in worktrees.

## Acceptance criteria

- [ ] Starting an approved feature creates its feature branch and moves its cards' ownership there
- [ ] `spawn_session` creates a worktree off the feature branch, moves the story card's ownership to it and starts a session with the requested role, model and reasoning
- [ ] The story row shows the agent, model and a link to the live session
- [ ] Each story session appears in the sidebar nested under the feature's chat

## Tasks

- [ ] Break down when picked up

## Notes
