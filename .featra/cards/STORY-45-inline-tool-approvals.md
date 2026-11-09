---
id: STORY-45
type: story
title: Inline tool approvals
status: New
parent: FEAT-3
order: 4
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

As a builder, I approve or deny an agent's tool call right in the chat, so the agent never acts without me when I've
asked it to ask.

## Acceptance criteria

- [ ] In Ask mode, a tool call that needs permission shows inline with the tool and its input, and Allow, Allow for
  this chat and Deny; Deny takes an optional reason that is sent to the agent
- [ ] The session waits until answered, and the answer goes back through `canUseTool`
- [ ] Each role has a default permission mode; the five built-in roles default to Ask
- [ ] A chat waiting on an approval is marked waiting (the dot from STORY-21)

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-5, STORY-21.
- Decision 2026-11-08: the permission mode is per role, and shipped roles start at Ask.
- Showing it in the Inbox is STORY-7.
