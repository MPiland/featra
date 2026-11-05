---
id: STORY-22
type: story
title: Composer controls and context meter
status: New
parent: FEAT-3
order: 5
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

As a builder, I change the agent's role, model, effort and permission mode from the composer and see how much context the chat has used.

## Acceptance criteria

- [ ] Role, model, effort and permission mode can be changed from the composer and apply to the next turn
- [ ] A context meter shows tokens used of the model's window and updates after each turn
- [ ] Featra reads token use from the session's own events, spending no extra tokens

## Tasks

- [ ] Break down when picked up

## Notes
