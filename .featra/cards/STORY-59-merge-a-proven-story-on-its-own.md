---
id: STORY-59
type: story
title: Merge a proven story on its own
status: New
parent: FEAT-8
order: 1
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

As a builder, I let a story merge into its feature branch on its own once it is Verified and Proven, so I don't click Merge for every story. Accept still gates Done, not the merge.

## Acceptance criteria

- [ ] With auto-merge on, a story that is Verified and Proven merges into its feature branch the same way Merge does, merged by system, without Accept
- [ ] A story that isn't both Verified and Proven, or that Merge would refuse, doesn't merge on its own and keeps the Merge button
- [ ] A story is checked when its evidence changes and once when the project opens; stories under one feature merge one at a time
- [ ] Auto-merge is a Workflow setting, on by default, with an app default and a project override; with it off nothing merges on its own
- [ ] The Dev Lead that started the story gets a notice that it merged

## Tasks

- [ ] Rules in work-format: when a story merges on its own (the merge rule plus Proven and the setting), the `autoMerge` default on
- [ ] Server: an observer that merges eligible stories through the existing merge, one at a time per feature, on evidence changes and at startup; the effective setting read with app defaults
- [ ] Server: a "merged" notice to the Dev Lead that started the story
- [ ] Client: the Auto-merge toggle on the Workflow settings pages, next to Require acceptance
- [ ] Remove `autoMerge: false` from this repo's .featra/config.yaml
- [ ] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; ADR 0034 amended (the user merges, or auto-merge when on); move to In Review

## Notes

Shaped with the user on 2026-11-16: merge on Verified and Proven, not Accept; on by default; the Dev Lead hears about every automatic merge.

## Depends on

- STORY-12 Merge a story into its feature
- STORY-57 Proven from a CI test report
