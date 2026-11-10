---
id: STORY-51
type: story
title: Approve or reject a draft
status: New
parent: FEAT-4
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-10T03:47:43Z
history:
  - at: 2026-11-10T03:47:43Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I approve a draft to make it the feature's scope, or reject it.

## Acceptance criteria

- [ ] Approve marks the feature approved, sets its scope baseline, and commits the cards to main locally, without pushing
- [ ] Reject removes the draft cards, leaving nothing in git
- [ ] After approval, Send back and Reject disappear; the chat stays open

## Tasks

- [ ] Break down when picked up

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
