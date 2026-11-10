---
id: STORY-52
type: story
title: Start a feature
status: New
parent: FEAT-5
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-10T18:00:00Z
history:
  - at: 2026-11-10T18:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

As the user or the Dev Lead, I start an approved feature so its work gets its own branch.

## Acceptance criteria

- [ ] Start on an approved feature (in Work and in the feature's chat) creates `feature/N-slug` from the base branch without changing main's checkout, and the feature becomes active with a `by: user` history event
- [ ] The Dev Lead can start it through the MCP tool `start_feature`; the history event says `by: session:<id>`
- [ ] After Start, the feature and its stories are read from the feature branch (the owner) and main's copies are no longer shown
- [ ] Start is refused with a clear message when the feature isn't approved, its branch already exists, or the base branch can't be found

## Tasks

- [ ] Break down when picked up

## Notes
