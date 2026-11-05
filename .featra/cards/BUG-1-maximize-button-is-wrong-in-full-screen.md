---
id: BUG-1
type: bug
title: Maximize button is wrong in full screen
status: In Review
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
  - at: 2026-11-05T19:20:30Z
    field: status
    from: New
    to: In Progress
    by: session:story-18
  - at: 2026-11-05T19:33:21Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-18
---

## Description

Found by the user after accepting STORY-18. After View > Full Screen (F11), the title bar's maximize/restore button still shows the not-full-screen icon. Clicking it shrinks the window, then it snaps back to full screen; a second click returns to the normal size. Caused by STORY-18 (the title bar tracks maximized but not full screen).

## Acceptance criteria

- [x] In full screen the button shows the restore icon and its label and tooltip say Exit Full Screen (test: apps/desktop/e2e/window-state.spec.ts::BUG-1: the maximize button and Full Screen follow the window > in full screen the button shows restore and says Exit Full Screen; one click returns to the window's size)
- [x] Clicking it in full screen leaves full screen in one click, back to the size and maximized state the window had before (test: apps/desktop/e2e/window-state.spec.ts::BUG-1: the maximize button and Full Screen follow the window > from a maximized window, one click in full screen returns to maximized)
- [x] View > Full Screen shows a checkmark while in full screen; F11, the menu and the button stay in sync (test: apps/desktop/e2e/window-state.spec.ts::BUG-1: the maximize button and Full Screen follow the window > View > Full Screen is checked in full screen; F11, the menu, the button and the OS stay in sync)

## Tasks

- [x] Regression e2e tests of the real window, failing before the fix
- [x] Main reports maximize, unmaximize, enter-full-screen and leave-full-screen to the client (bridge: state, onStateChange)
- [x] Title bar button: Maximize / Restore Down (Restore on Linux) / Exit Full Screen, with icon and tooltip
- [x] The button leaves full screen in full screen instead of un-maximizing
- [x] View > Full Screen is a checkmark item that follows the window
- [x] Same stale state for maximize changed by the OS: fixed and tested
- [x] Run on Windows and Linux (WSLg, xvfb)

## Notes
