# 0047 — The Browser pane: a view in the main window, its own session, and device emulation

Date: 2026-11-27 · Status: proposed

## Context

STORY-74 shows a story's or a feature's running app in a pane docked in the main window, beside its card or chat. The
user types any address, and sees the page as a phone, a tablet or a size of their own, as Chrome's device toolbar does.
Later stories build on the same pane: STORY-75 draws annotations over the page and screenshots an element or region,
and STORY-40 lets an agent drive it through an MCP tool. Proof's Preview (ADR 0044) keeps its own window.

The options for where the page lives were:

- An `<iframe>` in the client. The page would share the window's renderer and session, run under the client's CSP,
  and be refused by any site that sends `X-Frame-Options`; device emulation could only scale it.
- A `<webview>` tag. Electron discourages it, and it needs `webviewTag` on the window's own page, which ADR 0046 keeps
  to bundled files only.
- A `WebContentsView` of the main window, placed by the main process over a placeholder the client lays out.

## Decision

**The view.** The page is a `WebContentsView` added to the main window's `contentView`, one per window
(`browser-pane.ts`). The client renders the pane, its address bar and device toolbar, and an empty viewport, and sends
the viewport's rect (CSS px) with the device to show; the main process sizes the view to it times the window's zoom
factor. It hides the view while the viewport has no room, and while a dialog or modal covers the window (the view is
drawn over the page, so it would show through). Each pane has a key; calls for a pane closed or replaced since are
ignored, so a late layout never moves the next pane's view.

**Its session.** The view runs sandboxed, context-isolated and without Node, in partition `featra-browser`: in memory,
apart from the window's (`featra`, ADR 0046) and Proof's (`featra-dev-pages`, ADR 0044). It grants no permission and
takes no download. Unlike the window's, it keeps the system's proxy, as a browser does. Its pages may go to any http or
https address (`webUrl` in `dev-pages.ts`); no other scheme, and no URL with a user in it, is loaded, whether typed, by
a link or by a redirect. A page that opens a new window loads that address in the pane, which has one tab.

**The dev server.** Opening the pane starts the dev server with Proof's confirmed command (ADR 0044) through the same
`DevServers`: for a story in its worktree; for a feature in its branch's checkout, or in a temporary detached worktree
at the branch's tip (`featra-feature-preview-*`) when nobody has it checked out, as a feature's checks run (ADR 0037).
A server already running (Preview's) is reused. Closing the pane stops only a server its own start launched and removes
its checkout. Starts and stops for one pane run in turn, so a close sent during a start stops what that start launches.

**Emulation.** A device is shown through the Chrome DevTools Protocol on the view's `webContents.debugger`:
`Emulation.setDeviceMetricsOverride` with the device's width, height, pixel ratio, mobile flag and screen size, at a
`scale` that fits it in the pane (never up) times the window's zoom; touch emulation for phones and tablets. Fit to
pane clears the override. Commands are queued in order, sent only when they change, and sent again after each new
document. The user agent is left as is.

**The device choice.** The choice (Fit, Responsive and its size, or a device) and the devices the user added are kept
per project in the app's UI state (`browserDevices`, by project folder), with the pane's width (`browserPaneWidth`).
The brief suggested the project's settings; they are committed to the repository (`.featra/config.yaml`), and how one
person previews is theirs, as Work's layout is (`work-layout.ts`).

## Consequences

- The page is a real browser tab's equal: any site loads, frame-busting or not, and the page sees the device's
  viewport, pixel ratio and touch. `browser-pane.spec.ts` proves the width a page reports for a preset and a
  Responsive size.
- Playwright's capture of the window doesn't include the view; the journey composes its screens from both captures.
- The view is above the page, so nothing the client draws can overlap it. STORY-75's overlay is drawn in the page
  (injected into the view) or in a view of its own above it; `BrowserHandle.bounds` and `capture(rect)` are its seam.
- STORY-40 drives the open pane through `BrowserHandle` (`openPanes()`, `paneOf`): navigate, back, forward, reload,
  layout and capture, the same calls the client makes.
- A feature preview's temporary worktree left by a quit is pruned at the next start (`git worktree prune`); its
  folder in the temp directory is the OS's to clear.
- One pane per window: opening it for another card replaces the first, and stops its dev server.
