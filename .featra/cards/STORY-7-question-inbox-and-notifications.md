---
id: STORY-7
type: story
title: Inbox and notifications
status: New
parent: FEAT-3
order: 8
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

As a builder, I find every approval and question waiting on me in one Inbox and get told when one arrives, so a
blocked agent doesn't sit unnoticed while I'm away.

## Acceptance criteria

- [ ] An approval or question unanswered for 10 minutes also appears in the Inbox with its chat and card; the wait is
  set in Settings › App
- [ ] Answering it in the Inbox or the chat answers it once and clears it from both
- [ ] When Featra isn't focused, a desktop notification fires as soon as one arrives; clicking it opens the chat.
  Notifications can be turned off in Settings › App
- [ ] The sidebar's Inbox shows how many are waiting

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-45, STORY-46.
- Decisions 2026-11-08: the Inbox wait is 10 minutes (a sign the person is away); notifications fire at once and can
  be turned off. Logging answers moved to STORY-47.
