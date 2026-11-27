---
id: STORY-74
type: story
title: Preview in the Browser pane
status: In Progress
parent: FEAT-10
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-74-browser-pane
pr: null
created: 2026-11-27T12:00:00Z
history:
  - at: 2026-11-27T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-27T16:49:14Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, I open a story's or a feature's running app in a Browser pane docked beside its chat or card, and see it at the sizes my users will.

## Acceptance criteria

- [x] A Browser pane docks in the main window beside the chat or card pane. It opens from a story's or feature's card pane and from its chat, and resizes and closes like the other panes (test: packages/client/test/components/browser-pane.test.tsx:: from a story's card pane, beside it; packages/client/test/components/browser-pane.test.tsx:: from a story's chat; packages/client/test/components/browser-pane.test.tsx:: by its handle, and the width is kept; packages/client/test/components/browser-pane.test.tsx:: by Close, stopping its dev server and its view, and focus goes back to Browser; apps/desktop/e2e/browser-pane.spec.ts::Browser pane: a story's dev server shows beside its card, as any device, and stops when it closes)
- [x] Opening it for a story starts the story's dev server in its worktree, with the same command Proof's Preview uses, and shows it. Opening it for a feature does the same on the feature branch (test: packages/server/test/browser-preview.test.ts::The Browser pane's dev server > starts a story's dev server in its worktree, gives its URL, and stops it when the pane closes; packages/server/test/browser-preview.test.ts::The Browser pane's dev server > serves a feature in progress from a temporary checkout of its branch, removed when the pane closes; packages/client/test/components/browser-pane.test.tsx::AC2: it starts the story's dev server and shows it > asks the server to start it, then loads its URL in the pane's view and lays it out; apps/desktop/e2e/browser-pane.spec.ts::Browser pane: a story's dev server shows beside its card, as any device, and stops when it closes)
- [x] An address bar with back, forward and reload. You can type any URL. Pages run without Node access, in their own session, apart from Featra's own (test: packages/client/test/components/browser-pane.test.tsx::AC3: the address bar, back, forward and reload > goes back, forward and reloads, each when the page can; packages/client/test/components/browser-pane.test.tsx::AC3: the address bar, back, forward and reload > shows the page's address and loads any web address typed; apps/desktop/test/browser-pane.test.ts::the pane's page > is a view of its own in the window, without Node, in a session apart, hidden until laid out; apps/desktop/test/browser-pane.test.ts::the pane's page > goes to any web address, and nowhere else; apps/desktop/e2e/browser-pane.spec.ts::Browser pane: a story's dev server shows beside its card, as any device, and stops when it closes)
- [x] A device toolbar that works like Chrome's: Responsive mode with drag handles and width × height fields, a list of device presets, and custom devices you add. The choice is remembered per project (test: packages/client/test/components/browser-pane.test.tsx::AC4: the device toolbar > shows the page as a preset device: its size, pixel ratio and touch; packages/client/test/components/browser-pane.test.tsx::AC4: the device toolbar > Responsive takes a width and height by its fields and its handles; packages/client/test/components/browser-pane.test.tsx::AC4: the device toolbar > adds a device, which is chosen, and removes it; packages/client/test/components/browser-pane.test.tsx::AC4: the device toolbar > remembers the choice and the added devices per project; apps/desktop/test/browser-pane.test.ts::the device it shows > is the device's viewport, screen, pixel ratio and touch, at its scale times the window's zoom; apps/desktop/e2e/browser-pane.spec.ts::Browser pane: a story's dev server shows beside its card, as any device, and stops when it closes)
- [x] Closing the pane stops the dev server it started (test: packages/client/test/components/browser-pane.test.tsx::AC5: closing the pane stops the dev server it started > stops it when the pane goes away with its view; packages/server/test/browser-preview.test.ts::The Browser pane's dev server > reuses a dev server Preview started, and leaves it running when the pane closes; packages/server/test/browser-preview.test.ts::The Browser pane's dev server > stops what a start still under way launches when the pane closes meanwhile; apps/desktop/e2e/browser-pane.spec.ts::Browser pane: a story's dev server shows beside its card, as any device, and stops when it closes)

## Tasks

- [x] Server: start and stop the dev server for a story or a feature
- [x] Client: the pane, address bar, device toolbar, docking and per-project devices
- [x] Desktop: the page's view, session, navigation guard and emulation
- [x] Tests, journey and screens; ADR 0047

## Notes

Shaped with the user on 2026-11-27. The Browser pane is docked in the main window; Proof keeps its own preview window.
