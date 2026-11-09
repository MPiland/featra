---
id: STORY-44
type: story
title: Chats come back after a restart
status: New
parent: FEAT-3
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-08T22:00:00Z
history:
  - at: 2026-11-08T22:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I quit Featra and find my chats where I left them, so a restart never costs me a conversation.

## Acceptance criteria

- [ ] Featra keeps each chat's session id, title, project and role in its app data, not in the repo
- [ ] After a restart, the chat list shows the same chats, and opening one shows its transcript read from Claude's own
  session file, spending no tokens
- [ ] Sending a message in a restored chat resumes the same Claude session, with its context kept
- [ ] A chat whose session file is gone says so in one line and offers a new chat with the same role

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-5, STORY-21.
- Decision 2026-11-08: chats survive a restart and resume through the SDK.
