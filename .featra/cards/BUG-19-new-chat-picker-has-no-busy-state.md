---
id: BUG-19
type: bug
title: New chat picker has no busy state and can start two chats
status: In Review
parent: FEAT-5
order: 10
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-19
pr: "36"
created: 2026-11-11T23:00:00Z
history:
  - at: 2026-11-11T23:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T23:10:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-19
  - at: 2026-11-11T23:50:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-19
---

## Description

In the New chat picker, picking a role calls `chat.start`, which can take seconds on a cold start. Nothing shows that it
is working, and the role button stays live, so a second click starts a second chat.

## Acceptance criteria

- [x] While a chat is starting, every role button is disabled and the picker says "Starting…".
- [x] A second click while it starts makes no second chat: one `chat.start` call, one chat.
- [x] When the start is refused, the picker offers the roles again, with the reason.

## Tasks

- [x] Regression test with a held `chat.start`, failing before the fix
- [x] `starting` state in `NewChatDialog`: disable the roles, show the status
- [x] Short standard copy in `CHAT_COPY`

## Notes

Cause: `start` in `NewChatDialog.tsx` awaited `chats.start` with no state, so the picker looked the same and took more
clicks until the chat opened and closed it.

Fix: a `starting` flag disables the role buttons and shows a status line (`CHAT_COPY.starting`); it clears when the
start is refused, so the roles can be picked again. On success the picker closes as before.

Test: `new-chat-busy.test.tsx` drives the real App with a fake chat server that holds `chat.start`
(`slowStart` in `chat-server.ts`). On the old code the busy-state case fails (the buttons are not disabled). The refusal
case passes before and after: it guards the new state from sticking.
