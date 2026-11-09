---
id: STORY-5
type: story
title: Start a chat from a role and stream it
status: New
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
---

## Description

As a builder, I start a chat from a role and watch the agent work in a normal chat view, so I can work with Claude
inside Featra instead of a terminal.

## Acceptance criteria

- [ ] New chat with a role starts a Claude session through the Agent SDK with the user's own `claude`, in the project
  folder, with the role's prompt appended to Claude Code's system prompt and the role's model and effort
- [ ] The agent's reply streams into the chat as it arrives; Enter sends, Shift+Enter adds a line, and Stop ends the
  running turn
- [ ] Each tool call shows as one collapsed row (tool and a short summary) that expands to its input and result
- [ ] If `claude` isn't installed or isn't logged in, the chat says which in one line. Featra offers no login and
  reads no credential file
- [ ] The five built-in roles (Researcher, Analyst/Refiner, Dev Lead, Developer, QA) can be picked; each starts in
  Ask permission mode

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: FEAT-1, FEAT-2, FEAT-13. First story of FEAT-3; every other story builds on it.
- Tests fake the Agent SDK's `query` stream at the package boundary; Featra's session code runs for real. CI has no
  `claude` login.
- Until STORY-45 lands, a tool that needs approval is denied with a visible row. That exists only on the feature
  branch.
- The roles here are fixed definitions. STORY-6 adds editing, custom roles and provider roles.
