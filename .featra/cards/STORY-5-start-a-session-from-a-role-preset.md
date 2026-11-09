---
id: STORY-5
type: story
title: Start a chat from a role and stream it
status: In Progress
parent: FEAT-3
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
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
---

## Description

As a builder, I start a chat from a role and watch the agent work in a normal chat view, so I can work with Claude
inside Featra instead of a terminal.

## Acceptance criteria

- [ ] New chat with a role starts a Claude session through the Agent SDK with the user's own `claude`, in the project folder, with the role's prompt appended to Claude Code's system prompt and the role's model and effort
- [ ] The agent's reply streams into the chat as it arrives; Enter sends, Shift+Enter adds a line, and Stop ends the running turn
- [ ] Each tool call shows as one collapsed row (tool and a short summary) that expands to its input and result
- [ ] If `claude` isn't installed or isn't logged in, the chat says which in one line. Featra offers no login and reads no credential file
- [ ] The five built-in roles (Researcher, Analyst/Refiner, Dev Lead, Developer, QA) can be picked; each starts in Ask permission mode

## Tasks

- [ ] work-format: built-in roles (`roles.ts`), the chat event model and its reducer (`chat.ts`), tool-row summaries
  (`tool-summary.ts`); `chat.roles`, `chat.start`, `chat.watch`, `chat.send`, `chat.stop` and the `chat.event` push in
  `ServerMethods`
- [ ] Server: the provider adapter seam (`provider.ts`), the Claude adapter on the Agent SDK (`claude-provider.ts`,
  `claude-messages.ts`, `claude-locate.ts`), the role registry seam, the session manager (`chat-manager.ts`) with a
  pluggable approval handler that denies until STORY-45, and the API cases
- [ ] Desktop: the SDK loaded lazily and kept out of the bundle; an E2E-only fake of the SDK's `query`
- [ ] Client: the chat bridge, New chat with a role picker in the sidebar, the chat view (transcript, tool rows,
  notices, composer with Enter, Shift+Enter and Stop)
- [ ] Tests: work-format unit tests, Claude adapter tests over a fake `query`, session manager and socket tests,
  client component tests, the e2e journey `apps/desktop/e2e/chat.spec.ts`
- [ ] Docs: an ADR for sessions and providers, ADR 0015 method table, architecture.md, CONTEXT.md, decisions.md

## Notes

- Depends on: FEAT-1, FEAT-2, FEAT-13. First story of FEAT-3; every other story builds on it.
- Tests fake the Agent SDK's `query` stream at the package boundary; Featra's session code runs for real. CI has no
  `claude` login.
- Until STORY-45 lands, a tool that needs approval is denied with a visible row. That exists only on the feature
  branch.
- The roles here are fixed definitions. STORY-6 adds editing, custom roles and provider roles.
