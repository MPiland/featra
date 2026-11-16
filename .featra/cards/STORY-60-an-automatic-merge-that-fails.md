---
id: STORY-60
type: story
title: An automatic merge that fails
status: New
parent: FEAT-8
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-16T12:00:00Z
history:
  - at: 2026-11-16T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, when a story can't merge on its own, I see why on the story, and the Dev Lead hears about it without me relaying it.

## Acceptance criteria

- [ ] On a conflict nothing merges; the story returns to In Progress and its session gets the conflicting files, as with Merge
- [ ] The Dev Lead that started the story gets a "not merged" notice with the reason, for a conflict or any other refusal
- [ ] A refusal that isn't a conflict, such as branch protection, leaves the story where it is with the reason on the card, and isn't retried until the story changes
- [ ] The story's chat and card show that the automatic merge didn't happen and why

## Tasks

- [ ] Server: the auto-merge observer handles a conflict through the existing conflict path and records any other refusal once per story head
- [ ] Server: a "not merged" notice to the Dev Lead, with the reason
- [ ] Client: the reason shown on the card and in the story's chat
- [ ] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Notes

Shaped with the user on 2026-11-16: the Dev Lead hears about every automatic merge, merged or not.

## Depends on

- STORY-59 Merge a proven story on its own
