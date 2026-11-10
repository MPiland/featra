---
id: STORY-8
type: story
title: Dev Lead drafts a feature
status: Done
parent: FEAT-4
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-8-draft-cards
pr: "20"
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-10T03:54:33Z
    field: status
    from: New
    to: In Progress
    by: session:story-8
  - at: 2026-11-10T04:25:25Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-8
  - at: 2026-11-10T04:52:07Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-10T13:04:48Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-10T13:04:48Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a builder, I talk a feature through with the Dev Lead, and it drafts the feature and its stories as cards I can review.

## Acceptance criteria

- [x] The Dev Lead's `draft_cards` call creates a Draft feature with its stories (user story, ACs, tasks), owned by main and not committed
- [x] The Draft feature shows in Work with a Review badge
- [x] A later `draft_cards` call from the same chat updates that draft in place: same feature and IDs, changes recorded in each card's history
- [x] `draft_cards` works from any provider's chat through the Featra MCP

## Tasks

- [x] Parse and plan a draft in work-format (`parseDraft`, `planDraft`, `content` history field)
- [x] Write drafts to main uncommitted in the server (`draft-writer`, serialized IDs)
- [x] Add `cards.draft` to the agent socket and bridge (MCP off, knowledge, validation)
- [x] Add the `draft_cards` MCP tool whose description teaches the card format
- [x] Show the Review badge in the Work list
- [x] Record the drafting chat (`drafted-by`) for STORY-49
- [x] Add the E2E journey `draft.spec.ts` with a scripted draft turn
- [x] Write ADR 0021, decisions and open questions

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
- 2026-11-10: accepted by the user without a hands-on check; a true UAT comes later.
