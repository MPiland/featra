---
id: PBI-2
type: pbi
title: "Open a folder and initialise Featra"
status: New
parent: "FEAT-2"
order: 1
origin: planned
role: "developer"
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

Open a folder and initialise Featra.

## Acceptance criteria

- [ ] Opening a non-git folder offers git init; opening a repo without `.featra/` offers init
- [ ] Init scaffolds `.featra/config.yaml`, `CONTEXT.md`, `docs/adr/`, `decisions.md`, `open-questions.md` without overwriting existing files
- [ ] Agent instruction files (CLAUDE.md, AGENTS.md) are never created or edited

## Tasks

- [ ] Break down when picked up

## Notes

