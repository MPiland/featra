---
id: STORY-2
type: story
title: Open a folder and initialise Featra
status: In Progress
parent: FEAT-2
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
  - at: 2026-11-06T21:55:07.601Z
    field: status
    from: New
    to: In Progress
    by: lead
---

## Description

As a builder, I open a folder and Featra sets it up for card-based work without touching my own files.

## Acceptance criteria

- [ ] Opening a non-git folder offers git init; opening a repo without `.featra/` offers init
- [ ] Init scaffolds `.featra/config.yaml`, `CONTEXT.md`, `docs/adr/`, `decisions.md`, `open-questions.md` without overwriting existing files
- [ ] Init never creates or edits agent instruction files (CLAUDE.md, AGENTS.md) on its own

## Tasks

- [ ] Break down when picked up

## Notes
