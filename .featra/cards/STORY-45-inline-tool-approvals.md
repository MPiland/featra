---
id: STORY-45
type: story
title: Inline tool approvals
status: In Progress
parent: FEAT-3
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-45-approvals-e5365d
pr: https://github.com/MPiland/featra/pull/10
created: 2026-11-08T22:00:00Z
history:
  - at: 2026-11-08T22:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T15:55:19Z
    field: status
    from: New
    to: In Progress
    by: session:story-45
---

## Description

As a builder, I approve or deny an agent's tool call right in the chat, so the agent never acts without me when I've
asked it to ask.

## Acceptance criteria

- [x] In Ask mode, a tool call that needs permission shows inline with the tool and its input, and Allow, Allow for this chat and Deny; Deny takes an optional reason that is sent to the agent (test: packages/client/test/components/chat-approvals.test.tsx > AC1 (shows the tool, its input, the choices; sends Allow, Allow for this chat, Deny with the reason; Enter denies; no Allow for this chat for a once-only call; keyboard order); packages/server/test/chat-approvals.test.ts > AC1, AC2 sends Deny's reason to the agent through canUseTool; Allow for this chat (once-only calls, per chat, an answer before its tool row); packages/server/test/chat-approvals-suggested.test.ts (Allow for this chat applies Claude's suggested rule for the session; Featra's own rule without one); packages/server/test/chat-approvals-review.test.ts (shell rules key on the sandbox fields; a stopped turn allows nothing); packages/server/test/claude-rules.test.ts; packages/work-format/test/chat-rules.test.ts (Featra's rule: shell, paths inside the folder, .git, .claude, .. traversal, domains, MCP); packages/server/test/ws-chat-approve.test.ts; packages/work-format/test/approvals.test.ts; apps/desktop/e2e/chat-approvals.spec.ts journey)
- [x] The session waits until answered, and the answer goes back through `canUseTool` (test: packages/server/test/chat-approvals.test.ts > AC1, AC2 holds canUseTool until answered; refuses an answer to a request that isn't waiting; a pending approval when the request ends unanswered (Stop, the agent cancelling it, the chat closing); packages/server/test/chat-approvals-review.test.ts (interrupt on Stop and close; a repeated request; the agent failing); packages/server/test/chat-approvals-restart.test.ts (restart shows it cancelled, not denied; Allow for this chat is forgotten with the chat); packages/server/test/chat-session.test.ts > AC5; apps/desktop/e2e/chat-approvals.spec.ts journey)
- [x] Each role has a default permission mode; the five built-in roles default to Ask (test: packages/server/test/chat-approvals.test.ts > AC3 starts every built-in role in Ask; packages/work-format/test/approvals.test.ts > AC3)
- [x] A chat waiting on an approval is marked waiting (the dot from STORY-21) (test: packages/server/test/chat-approvals.test.ts > AC4; packages/work-format/test/approvals.test.ts > AC4; packages/client/test/components/chat-approvals.test.tsx > AC4; apps/desktop/e2e/chat-approvals.spec.ts journey)

## Tasks

- [x] work-format: approval events (`approval`, `tool-allowed`, `approval-cancelled`, a Deny reason), the row's approval state, the `approval` wait reason with the requests a chat waits on, and the Allow-for-this-chat rule
- [x] Server: an approval desk that holds each request until answered, remembers Allow for this chat in memory per chat, and cancels on Stop, close and restart; the role's permission mode picks the SDK's mode
- [x] Protocol: `chat.approve` answers a request
- [x] Client: the approval inline on the tool row (Allow, Allow for this chat, Deny with an optional reason), keyboard reachable; the waiting dot
- [x] Tests: unit (rules, fold, waits), server integration through the real adapter (fake `query`), over the socket, client component, one Electron journey
- [x] ADR 0018, CONTEXT.md and decisions.md updated

## Notes

- Depends on: STORY-5, STORY-21.
- Decision 2026-11-08: the permission mode is per role, and shipped roles start at Ask.
- Showing it in the Inbox is STORY-7.
