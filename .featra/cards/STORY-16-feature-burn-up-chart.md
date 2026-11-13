---
id: STORY-16
type: story
title: Feature burn-up chart
status: New
parent: FEAT-7
order: 3
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

As a builder, I see in the feature progress pane how a feature's scope and done work moved over time, so scope creep is
visible.

## Acceptance criteria

- [ ] The feature progress pane shows a burn-up with a scope line and a done line, built from the cards' `history[]`
- [ ] It counts stories, or tasks when the project's progress setting is tasks, matching the feature row's count
- [ ] It starts when the feature went in progress, its baseline, with one point per day and a last point for now; bugs count as added scope
- [ ] Changes that were never committed still appear in the chart
- [ ] No forecast, trend line or completion date is shown
- [ ] Before the feature goes in progress the pane says the chart starts then, instead of an empty chart

## Tasks

- [ ] Break down when picked up

## Notes
