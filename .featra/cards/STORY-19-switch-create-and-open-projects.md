---
id: STORY-19
type: story
title: Switch, create and open projects
status: New
parent: FEAT-13
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I switch between my projects from the top of the sidebar, and add one with New project or Open folder.

## Acceptance criteria

- [ ] The project switcher lists known projects and switches Work and the chat list to the chosen one
- [ ] New project… creates a folder and opens it; Open folder… adds an existing folder
- [ ] Project settings… in the switcher opens Settings on that project
- [ ] The File menu lists New project…, Open folder… and Project settings… with their shortcuts

## Tasks

- [ ] Break down when picked up
- [ ] Split `apps/desktop/src/main.ts` by job (windows, tray, menus, IPC) per `docs/coding-standards.md` before adding the project menu items

## Notes
