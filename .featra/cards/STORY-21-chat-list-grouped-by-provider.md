---
id: STORY-21
type: story
title: Chat list grouped by provider
status: In Progress
parent: FEAT-3
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
  - at: 2026-11-09T13:30:28Z
    field: status
    from: New
    to: In Progress
    by: session:story-21
---

## Description

As a builder, I see all my chats in the sidebar grouped by provider and start a new one with New chat.

## Acceptance criteria

- [ ] New chat starts a plain chat; a chat does not have to become a feature
- [ ] Chats are grouped by provider, built from the providers the user has installed
- [ ] A chat waiting on the user shows a status dot
- [ ] The File menu has New chat (Ctrl+N)

## Tasks

- [x] work-format: a chat's summary and status folded from its log (`chat-list.ts`), with a waiting-reason seam
      that STORY-45 (approvals) and STORY-46 (questions) extend; the list grouped by provider
- [x] Server: provider adapters report a name and whether they are installed; the session manager keeps each chat's
      summary and fans list changes out; `chat.list` watch per project (seam for STORY-44's restored chats)
- [x] Client: `ChatBridge.list`, the sidebar's chat list grouped by provider with a waiting dot; selecting a chat opens
      it, and chats join Back/Forward history
- [x] File > New Chat (Ctrl+N, ⌘N), from the menu and the keyboard; left out in a browser tab
- [x] Tests: unit (fold, grouping, shortcut, menu), server integration (manager + `chat.list` over the socket with
      a fake `query`), client component tests, one Electron journey
- [x] ADR 0018 and decisions.md updated

## Notes

- Depends on: STORY-5.
