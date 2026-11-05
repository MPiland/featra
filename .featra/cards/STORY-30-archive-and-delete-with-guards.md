---
id: STORY-30
type: story
title: Archive and delete with guards
status: New
parent: FEAT-15
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I archive or delete chats without losing work by accident.

## Acceptance criteria

- [ ] Delete is blocked while the session owns uncommitted work, an open PR, the card or a pending approval, and the dialog lists each reason and offers Archive instead
- [ ] Archiving a running session warns, then stops it and keeps the worktree, card and PR; unarchive resumes it

## Tasks

- [ ] Break down when picked up

## Notes
