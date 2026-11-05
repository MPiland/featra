---
id: STORY-8
type: story
title: Dev Lead drafts a feature for review
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

As a builder, I shape a feature in a chat with the Dev Lead and review its draft cards before anything starts.

## Acceptance criteria

- [ ] The Dev Lead's `draft_cards` call creates a Draft feature with stories (user story, ACs, tasks) owned by main
- [ ] The chat that drafted the feature renames itself to the feature's title
- [ ] The draft opens as a full-height card pane in that chat, with Approve and start, Send back… and Reject; Review draft in Work opens the same chat
- [ ] Send back requires a reason, which is sent to the Dev Lead as the user's message
- [ ] Rejecting removes the draft cards; approving marks the feature approved and becomes its scope baseline
- [ ] After approval, Send back and Reject disappear; the chat stays open

## Tasks

- [ ] Break down when picked up

## Notes
