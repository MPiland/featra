---
id: STORY-49
type: story
title: Review a draft in its chat
status: Done
parent: FEAT-4
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-49-review-draft
pr: https://github.com/MPiland/featra/pull/21
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
  - at: 2026-11-10T05:22:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
  - at: 2026-11-10T05:55:30Z
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

As a builder, I review a drafted feature right in the chat that drafted it.

## Acceptance criteria

- [x] The draft opens as a full-height card pane in the chat that drafted it
- [x] The chat renames itself to the feature's title
- [x] Review draft in Work opens that chat with the draft pane
- [x] A draft card can be edited in the pane; edits save to the owner copy and append to history

## Tasks

- [x] Pane edits append a `by: user` content event (work-format); a draft revision after one is still refused
- [x] The feature card lists its stories; the pane opens any of them
- [x] Drafting renames the chat to the feature title, never over a hand-set name
- [x] The chat shows the draft in a docked card pane; Review draft in Work opens that chat with it
- [x] Add the e2e journey `review-draft.spec.ts`
- [x] Write ADR 0022, decisions

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
- 2026-11-10: accepted by the user without a hands-on check; a true UAT comes later.
