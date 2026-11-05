# Decisions log

Short, dated decisions made in conversation. Larger, durable decisions get an ADR in `docs/adr/`.

- 2026-11-04 — Product name: Featra. Trademark and registrar check before public release.
- 2026-11-04 — M1 split into M1a (core loop, manual merges) and M1b (auto-merge, approval screen, annotations, UAT,
  knowledge promotion). Remote control is M2.
- 2026-11-04 — Claude is the only provider in M1; Codex and ACP agents in M2.
- 2026-11-04 — Home view is the feature list; the stage board is a read-only secondary view.
- 2026-11-04 — Burn-up counts items (stories and bugs) in both progress modes: task ticks are not history events, so a
  task-level burn-up can't be rebuilt from `history[]`. Feature rows still honour the `tasks` setting.
- 2026-11-04 — In `tasks` progress mode a Done story counts all its tasks as done.
- 2026-11-04 — Acceptance is explicit: `accepted`/`withdrawn` events. Moving a card back does not silently revoke it.
- 2026-11-04 — Claude provider: Agent SDK with `pathToClaudeCodeExecutable` set to the user's installed `claude`
  (the T3 Code pattern). Featra never offers a login or reads credentials. Anthropic's SDK terms make this a grey
  area; an API-key provider is on the roadmap as a fallback. See `docs/spike-claude-sdk.md`.
- 2026-11-04 — Sessions keep the SDK's default `settingSources` (user, project, local) so they behave like the user's
  own `claude`.
- 2026-11-04 — TypeScript is restricted to erasable syntax (`erasableSyntaxOnly`) so packages run under Node's
  built-in type stripping without a build step.
- 2026-11-05 — Researcher stories (no code, so no CI) reach Done on the user's Accept alone, whatever `requireAccept` says.
  All other stories still need Verified.
- 2026-11-05 — STORY-18 app shell:
  - The window is frameless and the client draws the title bar, with its own minimise/maximise/close on Windows and
    Linux. macOS keeps its native traffic lights (`titleBarStyle: hiddenInset`).
  - The Menu button opens File / Edit / View / Go / Help, modelled on the Claude desktop app's menu, in Title Case
    (sent back twice by the user; replaces the first flat developer menu and then a generic one). The model is
    `packages/client/src/menu.ts`. Items not built yet are hidden, not greyed; later stories add theirs (New Chat, New
    Project…, Open Folder…, pane toggles, Keyboard Shortcuts, Find, Previous/Next Chat). Only Back and Forward grey
    out, when there is nowhere to go (user decision). There is no Keyboard Shortcuts item and no Ctrl+/ yet: shortcuts
    live on a Settings page that STORY-20 builds.
  - File: Settings… Ctrl+,, Close Window Ctrl+Shift+W (hides to the tray, like the close button), Exit. Exit has no
    shortcut on Windows and Linux, as in Claude; Ctrl+Q is not bound, and Alt+F4 stays close-to-tray. macOS shows
    "Quit Featra" ⌘Q (user decision).
  - Edit: Undo, Redo, Cut, Copy, Paste, Delete, Select All. Delete has no shortcut label: the Delete key is Chromium's.
  - View: Sidebar (a checkmark while shown) Ctrl+B, Actual Size Ctrl+0, Zoom In Ctrl+=, Zoom Out Ctrl+-, Full Screen
    F11, Reload F5. Go: Back Alt+Left, Forward Alt+Right, then Work, Inbox, Artifacts and Plugins (the sidebar's views;
    Settings is in File). Help: Troubleshooting › (Show Logs in File Explorer, Toggle Developer Tools, Clear Cache and
    Restart, Reset App Data…), About Featra.
  - Every shortcut the menu shows works from the keyboard too; the client handles them in one keydown listener. macOS
    uses its own keys: ⌘W, ⌃⌘F, ⌘R, ⌘[ and ⌘]. Show Logs names the platform's file manager (File Explorer, Finder,
    File Manager). Redo is Ctrl+Y on Windows, Ctrl+Shift+Z on Linux and ⇧⌘Z on macOS.
  - No Theme submenu: theme moves to Settings > Appearance in STORY-20 (user decision). The stored theme and the
    `setTheme` bridge stay for it; the default is System, so the app follows the OS until then.
  - Featra writes a minimal main-process log, `userData/logs/main.log` (start, hide/show, troubleshooting, quit), so
    Show Logs opens something real. Past 1 MB it is moved to `main.old.log` on the next start. Writes never throw.
  - Clear Cache and Restart clears Chromium's HTTP cache and keeps stored settings. Reset App Data… asks first (Cancel
    is focused), then clears web storage, the cache, `ui-state.json` and `app-state.json`, and restarts; projects and
    the log are kept. Both log the step and relaunch (`app.relaunch()` + quit). The logic is
    `apps/desktop/src/troubleshoot.ts`, free of Electron imports.
  - Edit items send the command to main, which calls `webContents.undo/redo/cut/copy/paste/selectAll`, the same calls
    Electron's menu roles make. The menu puts focus back on the field the user was in before running an item. The
    keyboard shortcuts for editing are left to Chromium.
  - No native menu on Windows and Linux (`Menu.setApplicationMenu(null)`): Electron's default menu has its own
    zoom and reload accelerators that would bypass the saved state. macOS gets only the `appMenu` and `editMenu` roles,
    for the menu bar, ⌘Q and the system edit shortcuts.
  - Zoom steps are Chromium's (50%–200%). Zoom and theme are saved in `ui-state.json` with the sidebar state; unknown
    values fall back to 100% and System. A stored zoom between steps snaps to the nearest one.
  - A stored Light/Dark theme sets `data-theme` on `<html>` (pinning the CSS tokens) and `nativeTheme.themeSource`
    (native surfaces); System removes both overrides. Main applies the stored theme before the window opens.
  - In a plain browser tab the menu leaves out Close Window, Exit, Full Screen and Troubleshooting, which can't work
    there, and F11 and Ctrl+Shift+W are left to the browser.
  - About is a modal dialog: the app behind is inert, Tab stays inside, Escape closes, and focus
    returns to where it was. About reads the version from the desktop package (`app.getVersion()`).
  - The title bar shows the view title only ("Work"). The mockup's "· manager" project suffix waits for STORY-19.
  - Window chrome state (sidebar collapsed, zoom, theme) is `ui-state.json` in Electron's `userData`, written by main
    (atomic, flushed before quit), not renderer `localStorage`. `FEATRA_USER_DATA_DIR` overrides the folder. STORY-20
    may fold it into app settings.
  - Close goes to the system tray (sent back by the user): the close button and Alt+F4 hide the window and the app keeps
    running, so agent sessions carry on. It sits behind one flag in main, `CLOSE_TO_TRAY` (on), for STORY-20 to wire to
    Settings; off, closing quits as before. The logic is `apps/desktop/src/lifecycle.ts`, free of Electron imports.
  - Exit exits: File > Exit, the tray's Exit and any other quit (⌘Q, OS shutdown, `before-quit`) let the window close
    for real. A second launch reveals the running window (`requestSingleInstanceLock`, per userData).
  - The tray icon is a placeholder until there is a logo: a blue rounded square with a white "F"
    (`apps/desktop/assets/tray.png`, `tray@2x.png`). Left-click shows the window; right-click offers Show Featra and
    Exit.
  - The "still running in the system tray" notice is an OS notification on the first close only; that it was shown is
    remembered in `app-state.json` in userData (main's own state, apart from `ui-state.json`).
  - macOS: close hides the window and the app stays in the Dock; the Dock icon reopens it. No tray icon and no notice,
    since staying in the Dock is the platform convention.
  - Linux is a supported M1 platform: the window, title bar controls, menu and shortcuts are the Windows set (Redo
    aside). Linux trays are StatusNotifierItems, so close goes to the tray only when a StatusNotifier host owns
    `org.kde.StatusNotifierWatcher` on the session bus (KDE, most desktops, GNOME with the AppIndicator extension).
    Main asks with `dbus-send ... NameHasOwner`, then `gdbus` if dbus-send is missing; if neither can run, there is no
    tray. Without one (stock GNOME) close quits: an icon there would be invisible and the window unreachable. The check
    is `hasTrayHost` in `apps/desktop/src/tray-support.ts`, with the command runner injected, and is logged at start.
  - Linux trays often ignore clicks, so the tray always has its right-click menu; there, Show Featra is the restore
    path the tests use.
  - Quit finishes with `app.exit(0)` once the stores and log are flushed in `will-quit`, not a second `app.quit()`. On
    Linux (WSLg) a re-entered quit after the developer tools had been opened was sometimes dropped and the app hung
    (bug found on Linux; regression test in `tray.spec.ts`). By `will-quit` every window is closed and every quit
    handler has run, so nothing is skipped.
  - Minimise is up to the window manager. WSLg's does not advertise `_NET_WM_STATE_HIDDEN` and xvfb has none, so there
    `minimize()` has no effect, even on a framed window (checked with plain Electron). The tray test asserts that the
    title bar asked to minimise and then the outcome the WM supports (minimised, or still shown); the restore and focus
    after Show Featra are asserted everywhere.
  - E2E runs set `FEATRA_E2E=1`: main then records notifications and Show Logs' "show in folder" instead of doing
    them, `FEATRA_E2E_TRAY=absent` fakes a desktop with no tray host, a restart quits without relaunching (the test launches the next instance itself), and main exposes its
    real Tray to the test, which emits the tray's click and chooses its menu items (Playwright can't click the
    notification area). Alt+F4 is proved through `BrowserWindow.close()`, the call the OS close takes.
  - Back/forward is an in-memory view history; it does not survive a restart.
  - The light palette mirrors the dark mockup. Two colours differ from the mockup to meet AA: the menu shortcut hint uses
    `--tx2` (the mockup's `--tx3` is 3.4:1 on a focused item in dark), and light `--ok` is `#186f3f`.
  - No bundled webfont: Inter if the user has it, else Segoe UI / the system font. Nothing is fetched from Google Fonts.
  - The client talks to the host only through the `FeatraBridge` contract (`packages/client/src/bridge.ts`); a plain
    browser gets a localStorage fallback, which keeps the client usable for remote control later.
  - Main and preload are bundled by Vite to CommonJS, preload on its own because a sandboxed preload can't require chunks.
  - `pnpm test` runs Vitest and then the Electron e2e suite (which builds first); `pnpm test:unit` runs Vitest only.
  - Releases younger than pnpm's `minimumReleaseAge` are held back with `overrides` (vite 8.3.5, jsdom 30) or a
    lower range (electron ~45.2.2), not added to `minimumReleaseAgeExclude`.
- 2026-11-05 — Linux is a supported M1 platform alongside Windows and macOS. Each story's tests also run on Linux
  (Ubuntu under WSL2 on the dev machine). Linux trays often ignore a click, so the tray always has a right-click menu
  with Show Featra and Exit; when no tray is available, the close button quits instead of hiding the window.
