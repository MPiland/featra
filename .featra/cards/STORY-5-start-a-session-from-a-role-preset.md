---
id: STORY-5
type: story
title: Start a chat from a role and stream it
status: In Review
parent: FEAT-3
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-5-chat-d53f17
pr: https://github.com/MPiland/featra/pull/7
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T04:33:33Z
    field: status
    from: New
    to: In Progress
    by: session:story-5
  - at: 2026-11-09T13:18:56Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-5
---

## Description

As a builder, I start a chat from a role and watch the agent work in a normal chat view, so I can work with Claude
inside Featra instead of a terminal.

## Acceptance criteria

- [x] New chat with a role starts a Claude session through the Agent SDK with the user's own `claude`, in the project folder, with the role's prompt appended to Claude Code's system prompt and the role's model and effort (test: packages/server/test/chat-session.test.ts AC1, packages/server/test/claude-locate.test.ts AC1, packages/server/test/ws-chat.test.ts, apps/desktop/e2e/chat.spec.ts journey)
- [x] The agent's reply streams into the chat as it arrives; Enter sends, Shift+Enter adds a line, and Stop ends the running turn (test: packages/server/test/chat-session.test.ts AC2, packages/server/test/chat-stop.test.ts, packages/client/test/components/chat.test.tsx AC2, packages/client/test/chat-bridge.test.ts, packages/work-format/test/chat.test.ts AC2, apps/desktop/e2e/chat.spec.ts journey)
- [x] Each tool call shows as one collapsed row (tool and a short summary) that expands to its input and result (test: packages/work-format/test/chat.test.ts AC3, packages/server/test/chat-session.test.ts AC3, packages/server/test/claude-messages.test.ts AC3, packages/client/test/components/chat.test.tsx AC3, apps/desktop/e2e/chat.spec.ts journey)
- [x] If `claude` isn't installed or isn't logged in, the chat says which in one line. Featra offers no login and reads no credential file (test: packages/server/test/chat-session.test.ts AC4, packages/server/test/chat-credentials.test.ts AC4, packages/server/test/claude-messages.test.ts AC4, packages/client/test/components/chat.test.tsx AC4, apps/desktop/e2e/chat.spec.ts without claude)
- [x] The five built-in roles (Researcher, Analyst/Refiner, Dev Lead, Developer, QA) can be picked; each starts in Ask permission mode (test: packages/work-format/test/chat.test.ts AC5, packages/server/test/ws-chat.test.ts AC5, packages/server/test/chat-session.test.ts AC5, packages/client/test/components/chat.test.tsx AC5, apps/desktop/e2e/chat.spec.ts journey)

## Tasks

- [x] work-format: built-in roles (`roles.ts`), the chat event model and its reducer (`chat.ts`), tool-row summaries (`tool-summary.ts`); `chat.roles`, `chat.start`, `chat.watch`, `chat.send`, `chat.stop` and the `chat.event` push in `ServerMethods`
- [x] Server: the provider adapter seam (`provider.ts`), the Claude adapter on the Agent SDK (`claude-provider.ts`, `claude-messages.ts`, `claude-locate.ts`), the role registry seam, the session manager (`chat-manager.ts`) with a pluggable approval handler that denies until STORY-45, and the API cases
- [x] Desktop: the SDK loaded lazily and kept out of the bundle; an E2E-only fake of the SDK's `query`
- [x] Client: the chat bridge, New chat with a role picker in the sidebar, the chat view (transcript, tool rows, notices, composer with Enter, Shift+Enter and Stop)
- [x] Tests: work-format unit tests, Claude adapter tests over a fake `query`, session manager and socket tests, client component tests, the e2e journey `apps/desktop/e2e/chat.spec.ts`
- [x] Docs: an ADR for sessions and providers, ADR 0015 method table, architecture.md, CONTEXT.md, decisions.md

## Notes

- Depends on: FEAT-1, FEAT-2, FEAT-13. First story of FEAT-3; every other story builds on it.
- Tests fake the Agent SDK's `query` stream at the package boundary; Featra's session code runs for real. CI has no
  `claude` login.
- Until STORY-45 lands, a tool that needs approval is denied with a visible row. That exists only on the feature
  branch.
- The roles here are fixed definitions. STORY-6 adds editing, custom roles and provider roles.
- Behaviour change (review): logged out is read only from the SDK's `error: "authentication_failed"`. A result or
  reply that only mentions logging in now shows as itself (a failed result shows its message), not as logged out.
- User decision 2026-11-09 ("Add New chat to list"): New chat stays in the sidebar above Work. STORY-18's shell
  journey (`e2e/shell.spec.ts`, both sidebar checks) and `app.test.tsx` now expect it; every other check is unchanged.
- Verified: CI green on 5c9c977 (Gate, E2E (Windows), E2E (Ubuntu)),
  https://github.com/MPiland/featra/actions/runs/42623964860
