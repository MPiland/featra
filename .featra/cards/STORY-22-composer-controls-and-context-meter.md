---
id: STORY-22
type: story
title: Composer controls and context meter
status: In Review
parent: FEAT-3
order: 9
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-22-composer
pr: https://github.com/MPiland/featra/pull/15
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T23:02:11Z
    field: status
    from: New
    to: In Progress
    by: session:story-22
  - at: 2026-11-10T02:14:39Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-22
---

## Description

As a builder, I change the agent's role, model, effort and permission mode from the composer and see how much context the chat has used.

## Acceptance criteria

- [ ] Role, model, effort and permission mode can be changed from the composer and apply to the next turn
- [ ] A context meter shows tokens used of the model's window and updates after each turn
- [ ] Featra reads token use from the session's own events, spending no extra tokens

## Tasks

- [x] work-format: chat-controls (choices, settings, usage, token format), usage event and state
- [x] Claude adapter: controls, settings, apply on next turn by restarting the session with resume
- [x] Claude adapter: read usage and window from the session own messages (assistant usage, result modelUsage), also from history
- [x] Session manager and protocol: chat.controls and chat.configure, role change updates the row
- [x] Client: composer controls (Role, Model, Effort, Mode) and the context meter
- [x] Tests: work-format, server, client component, e2e/composer.spec.ts with the fake SDK
- [x] ADR, decisions, open questions, CONTEXT, full gate, PR and green CI

## Notes

- Depends on: STORY-5, STORY-6.
