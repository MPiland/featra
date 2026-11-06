---
id: STORY-19
type: story
title: Switch, create and open projects
status: In Progress
parent: FEAT-13
order: 5
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
  - at: 2026-11-06T15:36:13Z
    field: status
    from: New
    to: In Progress
    by: session:story-19
---

## Description

As a builder, I switch between my projects from the top of the sidebar, and add one with New project or Open folder.

## Acceptance criteria

- [ ] The project switcher lists known projects and switches Work and the chat list to the chosen one
- [ ] New project… creates a folder and opens it; Open folder… adds an existing folder
- [ ] Project settings… in the switcher opens Settings on that project
- [ ] The File menu lists New project…, Open folder… and Project settings… with their shortcuts

## Tasks

- [ ] Project list in main: `projects.json` in userData, the current project, folders that are gone left out, IPC checked
- [ ] Bridge and preload: list, switch, Open Folder…, New Project… (create), Choose… location; folder dialogs faked in e2e
- [ ] Reusable menu button control (`controls/MenuButton.tsx`), shared by the app menu and the switcher
- [ ] Project switcher at the top of the sidebar: known projects, New Project…, Open Folder…, Project Settings…
- [ ] New Project dialog: name and location, checked as you type and again in main
- [ ] Work, the title bar and the chat list follow the current project; Settings' picker lists every known project
- [ ] File menu: New Project…, Open Folder…, Project Settings… with their shortcuts, from the keyboard too
- [ ] Unit tests for the rules; component tests; e2e journey; gate and e2e on Windows and Linux
- [x] Split `apps/desktop/src/main.ts` by job (windows, tray, menus, IPC) per `docs/coding-standards.md` before adding the project menu items

## Notes
