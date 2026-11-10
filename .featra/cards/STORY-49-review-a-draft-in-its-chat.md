---
id: STORY-49
type: story
title: Review a draft in its chat
status: In Progress
parent: FEAT-4
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-49-review-draft
pr: null
created: 2026-11-10T03:47:43Z
history:
  - at: 2026-11-10T03:47:43Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-10T05:03:05Z
    field: status
    from: New
    to: In Progress
    by: developer
---

## Description

As a builder, I review a drafted feature right in the chat that drafted it.

## Acceptance criteria

- [ ] The draft opens as a full-height card pane in the chat that drafted it
- [ ] The chat renames itself to the feature's title
- [ ] Review draft in Work opens that chat with the draft pane
- [ ] A draft card can be edited in the pane; edits save to the owner copy and append to history

## Tasks

- [ ] Pane edits append a `by: user` content event (work-format); a draft revision after one is still refused
- [ ] The feature card lists its stories; the pane opens any of them
- [ ] Drafting renames the chat to the feature title, never over a hand-set name
- [ ] The chat shows the draft in a docked card pane; Review draft in Work opens that chat with it
- [ ] Add the e2e journey `review-draft.spec.ts`
- [ ] Write ADR 0022, decisions

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
