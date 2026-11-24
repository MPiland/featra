---
id: STORY-72
type: story
title: See attached evidence next to criteria
status: In Progress
parent: FEAT-9
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-72-evidence
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-24T13:18:59Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, I see the evidence an agent attached to a criterion, such as a screenshot, right next to it.

## Acceptance criteria

- [ ] A screenshot attached to a criterion shows as a thumbnail next to it on the approval screen and in the story's card pane
- [ ] Clicking a thumbnail opens it full size, and Escape closes it
- [ ] Other attached files show as a link that opens the file
- [ ] Evidence that is missing or unreadable says so instead of breaking the criterion

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-23. Agents can already attach evidence under `.featra/evidence/` through `update_card`; the app has never shown it.

## Depends on

- STORY-69 Review a feature on one screen
