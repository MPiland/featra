---
id: STORY-76
type: story
title: Send annotations to the session
status: New
parent: FEAT-10
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-27T12:00:00Z
history:
  - at: 2026-11-27T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I send my annotations as one message to the session working on what I'm previewing, and check it before it goes.

## Acceptance criteria

- [ ] Send targets the session tied to the preview: the story's session, or the Dev Lead's chat for a feature. A picker switches to any other chat in the project
- [ ] Send puts one draft in the target chat's composer and opens that chat: each annotation numbered, with its comment and captured details, and its screenshot attached. Nothing is sent until you send it
- [ ] When the message is sent, its annotations clear from the page
- [ ] If the target's agent can't take images, the screenshots are saved to files and the message lists their paths

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-27.
