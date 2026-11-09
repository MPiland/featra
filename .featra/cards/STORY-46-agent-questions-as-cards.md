---
id: STORY-46
type: story
title: Agent questions as cards
status: New
parent: FEAT-3
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-08T22:00:00Z
history:
  - at: 2026-11-08T22:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I answer an agent's question by picking from its options in a card, so the agent gets a clear answer
and keeps going.

## Acceptance criteria

- [ ] An AskUserQuestion call shows as a card with each question, its options (several at once where the agent
  allows it) and an Other field
- [ ] Submitting sends the answers back as the tool's result, and the agent continues the same turn
- [ ] An answered card collapses to the chosen answers
- [ ] A chat waiting on a question is marked waiting

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-5, STORY-21. Intercepted through `canUseTool` (docs/spike-claude-sdk.md).
