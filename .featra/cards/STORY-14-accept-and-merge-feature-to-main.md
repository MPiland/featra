---
id: STORY-14
type: story
title: Accept a feature and merge it to main
status: New
parent: FEAT-6
order: 8
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

As a builder, a finished feature reaches main only after I Accept it and press Merge to main.

## Acceptance criteria

- [ ] Accept on a feature is available once all its stories are Done
- [ ] With the project setting "Open feature PRs automatically" on (the default), accepting opens the feature's PR to main; with it off, the feature shows Create PR; local mode has no PR
- [ ] Merge to main is enabled only after Accept and once the feature's checks pass; it uses a merge commit, and a merge on GitHub outside Featra is noticed
- [ ] When main has moved on or conflicts, Featra sends it to the Dev Lead to merge main into the feature branch, never rebasing, and Merge to main waits for passing checks
- [ ] After the merge, all the feature's cards are owned by main and the feature is Done

## Tasks

- [ ] Break down when picked up

## Notes

## Depends on

- STORY-12 Merge a story into its feature
- STORY-23 Accept or send back a story
