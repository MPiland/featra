---
id: BUG-1
type: bug
title: Maximize button is wrong in full screen
status: New
parent: FEAT-13
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T19:19:52Z
history:
  - at: 2026-11-05T19:19:52Z
    field: status
    from: null
    to: New
    by: user
---

## Description

Found by the user after accepting STORY-18. After View > Full Screen (F11), the title bar's maximize/restore button still shows the not-full-screen icon. Clicking it shrinks the window, then it snaps back to full screen; a second click returns to the normal size. Caused by STORY-18 (the title bar tracks maximized but not full screen).

## Acceptance criteria

- [ ] In full screen the button shows the restore icon and its label and tooltip say Exit Full Screen
- [ ] Clicking it in full screen leaves full screen in one click, back to the size and maximized state the window had before
- [ ] View > Full Screen shows a checkmark while in full screen; F11, the menu and the button stay in sync

## Tasks

## Notes
