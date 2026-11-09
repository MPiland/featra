---
id: STORY-44
type: story
title: Chats come back after a restart
status: In Review
parent: FEAT-3
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-44-restore-7e884d
pr: https://github.com/MPiland/featra/pull/9
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
  - at: 2026-11-09T15:10:16Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-44
---

## Description

As a builder, I quit Featra and find my chats where I left them, so a restart never costs me a conversation.

## Acceptance criteria

- [x] Featra keeps each chat's session id, title, project and role in its app data, not in the repo (test: packages/server/test/chat-restore.test.ts > AC1 saves its session id, title, project and role, and nothing in the repo; saved chats: the edges > keeps a chats file that isn't JSON as chats.json.bad, and starts afresh; refuses to read a chats file it can't open, rather than reading it as no chats; never saves over a chats file it couldn't read: this run's chats stay in memory; packages/work-format/test/chat-saved.test.ts; packages/server/test/ws-chat-restore.test.ts; apps/desktop/e2e/chat-restore.spec.ts journey)
- [x] After a restart, the chat list shows the same chats, and opening one shows its transcript read from Claude's own session file, spending no tokens (test: packages/server/test/chat-restore.test.ts > AC2 lists them, and reads the transcript from Claude's session file without running the agent; pushes the restored chats to a list watcher that came before they were read; a project folder named in another case > is the same project on Windows and macOS, as the project list has it; is another project on Linux; packages/server/test/claude-transcript.test.ts; packages/server/test/ws-chat-restore.test.ts > lists the chat, watches its transcript, and resumes its session; answers chat.list with the saved chats, even when the file is read slowly; apps/desktop/e2e/chat-restore.spec.ts journey)
- [x] Sending a message in a restored chat resumes the same Claude session, with its context kept (test: packages/server/test/chat-restore.test.ts > AC3 starts the agent on the same session, and the reply joins the transcript; saved chats: the edges > a chat that never ran its agent comes back and starts a new session; packages/server/test/ws-chat-restore.test.ts; apps/desktop/e2e/chat-restore.spec.ts journey)
- [x] A chat whose session file is gone says so in one line and offers a new chat with the same role (test: packages/server/test/chat-restore.test.ts > AC4 says so, and refuses a message; is gone too when its project folder is gone; saved chats: the edges > a chat stopped before Claude wrote its session comes back as a fresh chat, not a gone one; packages/client/test/components/chat-gone.test.tsx > AC4 (one line, New chat with the same role in the same project, no composer))

## Tasks

- [x] work-format: a saved chat (`chat-saved.ts`: project, session id, row) and its file's parser; a `gone` problem
- [x] Server: `chats.json` in app data (the JSON store moves to the server); the manager saves on each change, loads at start, restores a closed project's chats when it opens again
- [x] Provider seam: `history(session, cwd)` (null when gone) and `resume` on start; the Claude adapter reads the transcript with the SDK's own reader and resumes with `resume`
- [x] Protocol: `chat.watch` and `chat.send` open a restored chat first (no agent starts until a message)
- [x] Client: the gone line with New chat (same role); no composer in a gone chat
- [x] Desktop: the server gets the app data folder
- [x] Tests: unit (parse, transcript translation, corrupt line, missing file, project gone), server integration over the socket, client component, one Electron journey across a restart
- [x] ADR 0018 and decisions.md updated

## Notes

- Depends on: STORY-5, STORY-21.
- Decision 2026-11-08: chats survive a restart and resume through the SDK.
- From STORY-5: the Claude adapter keeps the session id (`ProviderSession.sessionId()`), but the chat manager doesn't
  store or expose it yet. This story adds that.
- Known limits (Dev Lead review, PR #9): restored chats load before their project is opened (the API still gates
  them with `allow`); the session file is read whole, with no size cap.
