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
---

## Description

As a builder, I get a familiar ADE window: a title bar, a sidebar I can collapse, and Work, Inbox and Settings one click away.

## Acceptance criteria

- [x] The title bar shows the menu, sidebar toggle, back and forward, and the current view's title (test: packages/client/test/app.test.tsx::AC1: title bar > shows the menu, sidebar toggle, back and forward, and the current view's title)
- [x] Ctrl+B and the toggle collapse and expand the sidebar; the state survives a restart (test: apps/desktop/e2e/shell.spec.ts::app window: title bar, sidebar, Ctrl+B collapse survives restart)
- [x] The sidebar has Work, Inbox, Artifacts, Plugins and Settings entries, each reachable by keyboard (test: packages/client/test/app.test.tsx::AC3: sidebar entries > reaches and opens every entry with Tab and Enter)
- [x] The window follows the OS light or dark theme and meets WCAG AA contrast (test: apps/desktop/e2e/contrast.spec.ts::AC4: theme follows the OS and meets WCAG AA)

## Tasks

- [x] Scaffold packages/client (React + Vite) and apps/desktop (Electron main + preload) in the pnpm workspace
- [x] Bridge contract between client and host, with a browser fallback
- [x] Title bar: menu, sidebar toggle, back/forward, view title, window controls
- [x] Sidebar with Work, Inbox, Artifacts, Plugins, Settings and placeholder views
- [x] Ctrl+B / toggle collapse, persisted to userData/ui-state.json
- [x] Light and dark themes from prefers-color-scheme, AA contrast
- [x] Unit and component tests for each AC
- [x] Playwright Electron journey test and rendered-contrast test

## Notes

- Launch: `pnpm install`, then `pnpm start` at the repo root.
- Room is left for STORY-19 (project switcher), STORY-21 (New chat, chat list) and STORY-26..29 (title bar pane toggles, chat title menu).
- Decisions logged in `decisions.md` (2026-11-05).
