---
id: BUG-14
type: bug
title: Taskbar shows Electron's default icon
status: In Review
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-14-app-icon
pr: "16"
created: 2026-11-10T03:06:00Z
history:
  - at: 2026-11-10T03:06:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-10T03:07:06Z
    field: status
    from: New
    to: In Progress
    by: session:bug-14
  - at: 2026-11-10T03:13:53Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-14
---

## Description

Featra sets no app or window icon, so the Windows and Linux taskbar and the macOS dock show Electron's default. Only the tray has its own placeholder (`apps/desktop/assets/tray.png`). A real logo comes later; for now a placeholder: a white "F" on a rounded square in the client's accent colour.

## Acceptance criteria

- [x] The taskbar, window and dock show Featra's placeholder icon, not Electron's.
- [x] The icon is generated from a committed source by a script.

## Tasks

- [x] Commit the SVG source and the generator script
- [x] Set the window icon and the macOS dock icon

## Notes
