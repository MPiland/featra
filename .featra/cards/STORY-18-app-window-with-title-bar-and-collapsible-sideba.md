---
id: STORY-18
type: story
title: App window with title bar and collapsible sidebar
status: In Review
parent: FEAT-13
order: 1
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
  - at: 2026-11-05T17:15:38Z
    field: status
    from: New
    to: In Progress
    by: user
  - at: 2026-11-05T17:41:46Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-18
  - at: 2026-11-05T17:48:04Z
    field: status
    from: In Review
    to: In Progress
    by: user
  - at: 2026-11-05T18:01:06Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-18
  - at: 2026-11-05T18:02:22Z
    field: status
    from: In Review
    to: In Progress
    by: user
  - at: 2026-11-05T18:09:50Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-18
  - at: 2026-11-05T18:26:04Z
    field: status
    from: In Review
    to: In Progress
    by: user
  - at: 2026-11-05T18:41:04Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-18
---

## Description

As a builder, I get a familiar ADE window: a title bar, a sidebar I can collapse, and Work, Inbox and Settings one click away.

## Acceptance criteria

- [x] The title bar shows the menu, sidebar toggle, back and forward, and the current view's title (test: packages/client/test/app.test.tsx::AC1: title bar > shows the menu, sidebar toggle, back and forward, and the current view's title)
- [x] Ctrl+B and the toggle collapse and expand the sidebar; the state survives a restart (test: apps/desktop/e2e/shell.spec.ts::app window: title bar, menu, sidebar; close to tray and reopen; Ctrl+B collapse and zoom survive restart)
- [x] The sidebar has Work, Inbox, Artifacts, Plugins and Settings entries, each reachable by keyboard (test: packages/client/test/app.test.tsx::AC3: sidebar entries > reaches and opens every entry with Tab and Enter)
- [x] The window follows the OS light or dark theme and meets WCAG AA contrast (test: apps/desktop/e2e/contrast.spec.ts::AC4: theme follows the OS and meets WCAG AA)
- [x] The menu button opens File, Edit, View, Go and Help, modelled on Claude's desktop menu, in Title Case. File: Settings… Ctrl+,, Close Window Ctrl+Shift+W (to tray), Exit (no shortcut on Windows/Linux; Quit Featra Cmd+Q on macOS). Edit: Undo, Redo, Cut, Copy, Paste, Delete, Select All. View: Sidebar (checkmark) Ctrl+B, Actual Size, Zoom In, Zoom Out, Full Screen F11, Reload F5. Go: Back Alt+Left, Forward Alt+Right, Work, Inbox, Artifacts, Plugins. Help: Troubleshooting (Show Logs in File Explorer, Toggle Developer Tools, Clear Cache and Restart, Reset App Data…), About Featra. No Theme submenu (theme moves to Settings, STORY-20). Items not built yet are hidden, not greyed (test: packages/client/test/menu.test.tsx::AC5: app menu > opens File, Edit, View, Go and Help, modelled on Claude's menu in Title Case, with each item's shortcut)
- [x] Closing the window keeps Featra running in the system tray; the tray icon reopens the window, and Exit (menu or tray) exits (test: apps/desktop/e2e/tray.spec.ts::AC6: close to tray > close hides the window and the app keeps running; the notice shows once and is remembered)

## Tasks

- [x] Scaffold packages/client (React + Vite) and apps/desktop (Electron main + preload) in the pnpm workspace
- [x] Bridge contract between client and host, with a browser fallback
- [x] Title bar: menu, sidebar toggle, back/forward, view title, window controls
- [x] Sidebar with Work, Inbox, Artifacts, Plugins, Settings and placeholder views
- [x] Ctrl+B / toggle collapse, persisted to userData/ui-state.json
- [x] Light and dark themes from prefers-color-scheme, AA contrast
- [x] Unit and component tests for each AC
- [x] Playwright Electron journey test and rendered-contrast test
- [x] Menu model: File, Edit, View, Go, Help modelled on Claude, Title Case, platform shortcuts; unbuilt items hidden
- [x] Submenus by mouse and keyboard (arrows, Enter, Escape)
- [x] Actual Size, Zoom In, Zoom Out, persisted
- [x] No Theme submenu (moves to Settings, STORY-20); stored theme and bridge kept, default follows the OS
- [x] Edit items act on the focused field
- [x] About dialog; Troubleshooting: Show Logs, Toggle Developer Tools, Clear Cache and Restart, Reset App Data… (confirm)
- [x] Tests for each menu item; extend the journey test
- [x] Close hides the window instead of quitting, behind one flag in main (default on)
- [x] Tray icon (placeholder) with Show Featra / Exit; left-click shows the window
- [x] One-time notice on first close, remembered
- [x] Exit from the menu or tray exits for real; no Ctrl+Q on Windows/Linux, Quit Featra ⌘Q on macOS
- [x] Second launch shows the existing window
- [x] macOS: close hides, Dock icon reopens, no tray icon
- [x] Tests: close hides, tray Show restores, Exit exits, second launch focuses
- [x] Close Window (to tray), Full Screen, Reload, Back/Forward: each shortcut works from the keyboard
- [x] Go menu: Back/Forward (greyed when there is nowhere to go) and the sidebar views
- [x] Minimal main-process log in userData/logs for Show Logs

## Notes

- Launch: `pnpm install`, then `pnpm start` at the repo root.
- Room is left for STORY-19 (project switcher), STORY-21 (New chat, chat list) and STORY-26..29 (title bar pane toggles, chat title menu).
- Decisions logged in `decisions.md` (2026-11-05).
