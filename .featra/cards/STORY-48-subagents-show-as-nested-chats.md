---
id: STORY-48
type: story
title: Subagents show as nested chats
status: New
parent: FEAT-15
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-09T17:40:00Z
history:
  - at: 2026-11-09T17:40:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I see the subagents a chat starts nested under that chat, whatever the provider, so I can follow what
each one did.

## Acceptance criteria

- [ ] A subagent started in a Featra chat (Claude's Agent tool, Codex subagents, any provider that reports them) shows
  in the sidebar nested under the chat that started it
- [ ] Opening a subagent shows its transcript, read-only, with its prompt and final report
- [ ] A running subagent shows as working, and its parent shows it is waiting on it
- [ ] Nesting works the same for every provider through the provider adapter; a provider that doesn't report
  subagents shows none

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-21 (chat list), STORY-44 (chat index).
- Decision 2026-11-09 (user): nesting is not provider-specific; every provider's subagents nest under their chat. See
  STORY-32 for imported sessions.
