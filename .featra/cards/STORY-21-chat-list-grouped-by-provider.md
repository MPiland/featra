---
id: STORY-21
type: story
title: Chat list grouped by provider
status: Done
parent: FEAT-3
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-21-chat-list-c649de
pr: https://github.com/MPiland/featra/pull/8
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
  - at: 2026-11-09T13:59:23Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-21
  - at: 2026-11-09T14:17:46Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-09T14:17:46Z
    field: status
    from: In Review
    to: Done
    by: session:story-21
---

## Description

As a builder, I see all my chats in the sidebar grouped by provider and start a new one with New chat.

## Acceptance criteria

- [x] New chat starts a plain chat; a chat does not have to become a feature (test: packages/work-format/test/chat-list.test.ts > AC1: New chat starts a plain chat; packages/server/test/chat-list.test.ts > AC1 lists each chat started in the project; packages/client/test/components/chat-list.test.tsx > AC1 adds the chat to the list under its role's name; apps/desktop/e2e/chat-list.spec.ts journey)
- [x] Chats are grouped by provider, built from the providers the user has installed (test: packages/work-format/test/chat-list.test.ts > AC2: chats grouped by provider; packages/server/test/chat-list.test.ts > AC2 reports each registered provider by its name, installed when its agent is found; packages/server/test/ws-chat-list.test.ts > finds a provider installed or removed while the app runs; packages/client/test/components/chat-list.test.tsx > AC2 (installed group, no group when not installed, provider by its own name); apps/desktop/e2e/chat-list.spec.ts journey)
- [x] A chat waiting on the user shows a status dot (test: packages/work-format/test/chat-list.test.ts > AC3: a chat waiting on the user; packages/server/test/chat-list.test.ts > AC3 pushes the list when a turn ends, not per delta; packages/server/test/ws-chat-list.test.ts > answers the providers and the project's chats, then pushes the list; packages/client/test/components/chat-list.test.tsx > AC3 shows the dot once the agent's turn ends; apps/desktop/e2e/chat-list.spec.ts journey)
- [x] The File menu has New chat (Ctrl+N) (test: packages/client/test/components/chat-list.test.tsx > AC4: File > New Chat (Ctrl+N, ⌘N on macOS); packages/client/test/menu.test.tsx; packages/client/test/shortcuts.test.ts; packages/client/test/components/projects.test.tsx > uses Cmd on macOS; apps/desktop/e2e/chat-list.spec.ts journey)

## Tasks

- [x] work-format: a chat's summary and status folded from its log (`chat-list.ts`), with a waiting-reason seam that STORY-45 (approvals) and STORY-46 (questions) extend; the list grouped by provider
- [x] Server: provider adapters report a name and whether they are installed; the session manager keeps each chat's summary and fans list changes out; `chat.list` watch per project (seam for STORY-44's restored chats)
- [x] Client: `ChatBridge.list`, the sidebar's chat list grouped by provider with a waiting dot; selecting a chat opens it, and chats join Back/Forward history
- [x] File > New Chat (Ctrl+N, ⌘N), from the menu and the keyboard; left out in a browser tab
- [x] Tests: unit (fold, grouping, shortcut, menu), server integration (manager + `chat.list` over the socket with a fake `query`), client component tests, one Electron journey
- [x] ADR 0018 and decisions.md updated

## Notes

- Depends on: STORY-5.
