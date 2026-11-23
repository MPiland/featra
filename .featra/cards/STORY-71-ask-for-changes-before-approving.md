---
id: STORY-71
type: story
title: Ask for changes before approving
status: New
parent: FEAT-9
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, when a feature isn't right yet, I tell the Dev Lead why from the approval screen, and the feature shows that I asked until it's handled.

## Acceptance criteria

- [ ] "Not yet" on the approval screen needs a reason; the reason is sent to the feature's Dev Lead chat as my message
- [ ] The reason is logged in the feature's history and the screen shows "Changes asked" with it
- [ ] The Dev Lead can mark it handled through the MCP, saying what it did; the screen then shows that reply and "Changes asked" clears
- [ ] I can dismiss "Changes asked" myself
- [ ] Approve stays available while changes are asked

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-23. "Not yet" doesn't create cards; the Dev Lead decides what to add. A chat reply alone doesn't clear it.

## Depends on

- STORY-69 Review a feature on one screen
