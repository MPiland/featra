---
id: STORY-8
type: story
title: Dev Lead drafts a feature
status: New
parent: FEAT-4
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

As a builder, I talk a feature through with the Dev Lead, and it drafts the feature and its stories as cards I can review.

## Acceptance criteria

- [ ] The Dev Lead's `draft_cards` call creates a Draft feature with its stories (user story, ACs, tasks), owned by main and not committed
- [ ] The Draft feature shows in Work with a Review badge
- [ ] A later `draft_cards` call from the same chat updates that draft in place: same feature and IDs, changes recorded in each card's history
- [ ] `draft_cards` works from any provider's chat through the Featra MCP

## Tasks

- [ ] Break down when picked up

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
