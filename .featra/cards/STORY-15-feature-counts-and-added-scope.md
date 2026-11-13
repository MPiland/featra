---
id: STORY-15
type: story
title: Feature counts and added scope
status: New
parent: FEAT-7
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

As a builder, I read a feature's and an epic's progress at a glance and see what was added after the feature started.
Counts, stage-split bars, epic bars and "+N added" already ship; this story fills the gaps.

## Acceptance criteria

- [ ] Hovering or focusing a feature's bar shows its breakdown by stage, for example "1 done · 1 needs your Accept · 2 in progress · 1 not started"; an epic's bar does the same by feature status
- [ ] A feature's scope baseline is set when the feature goes in progress (Start feature), not at approval; stories added between approval and start are planned scope
- [ ] A feature approved before this change keeps working: its baseline is the moment it went in progress, read from its history
- [ ] Items added after the baseline show their origin in the feature row's "+N added" breakdown: added stories and bugs counted apart

## Tasks

- [ ] Break down when picked up

## Notes
