---
id: STORY-44
type: story
title: Chats come back after a restart
status: In Progress
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
  - at: 2026-11-09T14:28:12Z
    field: status
    from: New
    to: In Progress
    by: session:story-44
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

- [ ] work-format: a saved chat (`chat-saved.ts`: project, session id, row) and its file's parser; a `gone` problem
- [ ] Server: `chats.json` in app data (the JSON store moves to the server); the manager saves on each change, loads
      at start, restores a closed project's chats when it opens again
- [ ] Provider seam: `history(session, cwd)` (null when gone) and `resume` on start; the Claude adapter reads the
      transcript with the SDK's own reader and resumes with `resume`
- [ ] Protocol: `chat.watch` and `chat.send` open a restored chat first (no agent starts until a message)
- [ ] Client: the gone line with New chat (same role); no composer in a gone chat
- [ ] Desktop: the server gets the app data folder
- [ ] Tests: unit (parse, transcript translation, corrupt line, missing file, project gone), server integration over
      the socket, client component, one Electron journey across a restart
- [ ] ADR 0018 and decisions.md updated

## Notes

- Depends on: STORY-5, STORY-21.
- Decision 2026-11-08: chats survive a restart and resume through the SDK.
- From STORY-5: the Claude adapter keeps the session id (`ProviderSession.sessionId()`), but the chat manager doesn't
  store or expose it yet. This story adds that.
