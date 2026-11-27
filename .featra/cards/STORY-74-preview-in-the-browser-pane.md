---
id: STORY-74
type: story
title: Preview in the Browser pane
status: New
parent: FEAT-10
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-27T12:00:00Z
history:
  - at: 2026-11-27T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I open a story's or a feature's running app in a Browser pane docked beside its chat or card, and see it at the sizes my users will.

## Acceptance criteria

- [ ] A Browser pane docks in the main window beside the chat or card pane. It opens from a story's or feature's card pane and from its chat, and resizes and closes like the other panes
- [ ] Opening it for a story starts the story's dev server in its worktree, with the same command Proof's Preview uses, and shows it. Opening it for a feature does the same on the feature branch
- [ ] An address bar with back, forward and reload. You can type any URL. Pages run without Node access, in their own session, apart from Featra's own
- [ ] A device toolbar that works like Chrome's: Responsive mode with drag handles and width × height fields, a list of device presets, and custom devices you add. The choice is remembered per project
- [ ] Closing the pane stops the dev server it started

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-27. The Browser pane is docked in the main window; Proof keeps its own preview window.
