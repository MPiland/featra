---
id: FEAT-3
type: feature
title: Sessions and roles
status: approved
parent: EPIC-1
order: 5
origin: planned
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: approved
    by: user
---

## Description

Run Claude sessions inside Featra from roles, with approvals and questions answered in the chat or the Inbox, and
decisions logged by the agents through the Featra MCP.

## Stories, in build order

1. STORY-5 Start a chat from a role and stream it
2. STORY-21 Chat list grouped by provider (after STORY-5)
3. STORY-44 Chats come back after a restart (after STORY-5, STORY-21)
4. STORY-45 Inline tool approvals (after STORY-5, STORY-21)
5. STORY-46 Agent questions as cards (after STORY-5, STORY-21)
6. STORY-6 Built-in, custom and provider roles (after STORY-5)
7. STORY-47 Featra MCP logs decisions and open questions (after STORY-5)
8. STORY-7 Inbox and notifications (after STORY-45, STORY-46)
9. STORY-22 Composer controls and context meter (after STORY-5, STORY-6)

## Depends on

- FEAT-1 Provider spike
- FEAT-2 Cards, ownership and feature list
- FEAT-13 App shell, projects and settings
