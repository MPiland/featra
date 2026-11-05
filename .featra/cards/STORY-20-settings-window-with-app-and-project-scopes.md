---
id: STORY-20
type: story
title: Settings window with app and project scopes
status: New
parent: FEAT-13
order: 3
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

As a builder, I change app-wide and per-project settings in one Settings window.

## Acceptance criteria

- [ ] Settings has an App scope and a Project scope with a project picker that defaults to the current project
- [ ] App settings are stored in the user's config folder; project settings in .featra/config.yaml
- [ ] A project value that overrides an app default is labelled as an override and can be reset
- [ ] Every setting is reachable and changeable by keyboard
- [ ] Settings… in the File menu (Ctrl+,) opens the Settings window
- [ ] App settings include "Close button: keep running in the tray / quit", default keep running; it applies without a restart
- [ ] Settings has a Keyboard shortcuts page listing every shortcut by area, searchable; Help > Keyboard shortcuts and Ctrl+/ open it

## Tasks

- [ ] Break down when picked up

## Notes
