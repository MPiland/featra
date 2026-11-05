---
id: STORY-23
type: story
title: Accept or send back a story from its chat
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
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, when a story is ready I accept it, or send it back with a reason, from wherever I am looking at it.

## Acceptance criteria

- [ ] A story waiting on Accept shows an Accept card at the end of its chat, in its card pane, and in Work
- [ ] Accept records Accepted evidence in the card's history
- [ ] Send back requires a reason; it is sent to the story's session as the user's message, logged in history, and can be added as a new acceptance criterion
- [ ] After Accept, Send back disappears everywhere; the chat stays open and later changes count as added scope or bugs

## Tasks

- [ ] Break down when picked up

## Notes
