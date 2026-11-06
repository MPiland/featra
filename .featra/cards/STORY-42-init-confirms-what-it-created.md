---
id: STORY-42
type: story
title: Init confirms what it created
status: In Progress
parent: FEAT-2
order: 4
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T23:42:10Z
history:
  - at: 2026-11-06T23:42:10Z
    field: status
    from: null
    to: New
    by: lead
  - at: 2026-11-06T23:44:11Z
    field: status
    from: New
    to: In Progress
    by: developer
---

## Description

As a builder, when I initialise Featra I see what it created and what it kept, so I don't have to check the folder.

## Acceptance criteria

- [ ] After Initialize Featra succeeds, Work shows a short confirmation ("Featra is set up") listing the files it created and any it kept
- [ ] After Initialize Git succeeds, the next step (Initialize Featra) shows without a reload
- [ ] The confirmation can be dismissed and does not come back for that project

## Tasks

- [ ] Break down when picked up

## Notes

- Found when the user tried STORY-2 on a real project: the banner just disappeared and they had to check the folder.
  The server already returns `{ created, kept }` from `project.init`; the client drops it.
