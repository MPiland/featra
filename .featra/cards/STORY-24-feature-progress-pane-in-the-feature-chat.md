---
id: STORY-24
type: story
title: Feature progress pane
status: New
parent: FEAT-7
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I open a feature's progress pane from its chat or its row in Work and see every story's progress without
asking the Dev Lead.

## Acceptance criteria

- [ ] A Feature progress button appears only on chats that coordinate a feature, and opens the pane docked on the right
- [ ] Opening a feature row in Work shows the same pane, so a feature without a chat has it too
- [ ] The pane shows the feature's counts and bar, added scope, open bugs and branch, and each story's stage, criteria, tasks and PR
- [ ] Clicking a story opens its chat, or its card when it has no chat; a story waiting on the user is marked
- [ ] The pane updates live from the cards and spends no agent tokens

## Tasks

- [ ] Break down when picked up

## Notes
