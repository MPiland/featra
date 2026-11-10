---
id: STORY-54
type: story
title: Story agents report to the Dev Lead
status: New
parent: FEAT-5
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-10T18:00:00Z
history:
  - at: 2026-11-10T18:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

As the user, I let the Dev Lead coordinate the story agents: they report to it, and it steers them.

## Acceptance criteria

- [ ] When a story session ends a turn, stops or fails, a short notice (story, outcome, a summary of its last message) is posted into the Dev Lead's chat
- [ ] A story agent's `ask_user` goes to the Dev Lead as a notice; the Dev Lead answers it with `message_session` or escalates to the user with `ask_user`
- [ ] `message_session(story, text)` from the Dev Lead sends to that story's session, resuming it when idle; any other chat calling it is refused
- [ ] Notices that arrive while the Dev Lead is busy are delivered together when it is idle, not one turn per notice

## Tasks

- [ ] Break down when picked up

## Notes
