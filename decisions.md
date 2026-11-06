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
    out, when there is nowhere to go (user decision). STORY-20 added Help > Keyboard Shortcuts (Ctrl+/), opening the
    shortcuts page in Settings.
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
  - No Theme submenu: theme moves to Settings > Appearance in STORY-20 (user decision). STORY-20 built it; the
    `setTheme` bridge is what it uses. The default is System.
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
    moved the theme out to `settings.json`; `ui-state.json` keeps the sidebar and zoom.
  - Close goes to the system tray (sent back by the user): the close button and Alt+F4 hide the window and the app keeps
    running, so agent sessions carry on. STORY-20 made it the Settings > General > Close button
    setting (default keep running); set to quit, closing quits. The logic is `apps/desktop/src/lifecycle.ts`, free of Electron imports.
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
  - BUG-1 (found by the user after STORY-18 was accepted): the title bar's maximize button didn't know the window's
    state, so in full screen it un-maximized and the OS snapped the window back. Main now sends `{ maximized,
    fullScreen }` on `maximize`, `unmaximize`, `enter-full-screen` and `leave-full-screen`, whoever caused them (the
    button, F11, the menu, a title-bar double-click, Win+Up, snapping), and the client asks for it on load. The
    button reads Maximize, Restore Down (Restore on Linux, the GNOME/KDE word) or Exit Full Screen, with a restore
    icon for the last two and the same text as its tooltip; in full screen it leaves full screen, which puts back the
    size and maximized state the window had. View > Full Screen is a checkmark item. The rules are `sizeButtonAction`
    and `sizeButtonFor` in `packages/client/src/bridge.ts`.
  - Maximising is up to the window manager too: WSLg's can, xvfb (none) can't. There the e2e test proves the button
    keeps saying Maximize after a maximize request goes nowhere, instead of maximizing.
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
- 2026-11-05 — A one-off WSLg e2e failure is not a product bug. Reset App Data e2e failed once on WSLg while the Windows
  suite ran on the same machine.
  - Not reproduced in about 3,120 isolated menu.spec runs on WSLg, with and without diagnostics, plus the test alone ×20
    and the full suite ×4. Two more isolated failures came without stderr, and possibly during other sessions' runs.
  - It reproduced at once with the Windows suite running alongside (1 of 40). Stderr showed `X connection error
    received` (Chromium `ui/gfx/x/connection.cc`): WSLg's X server dropped the app's connection, and Chromium shuts the
    app down on that. No app code is involved, so assertions are unchanged and there is no product fix.
  - Rule: run the WSLg e2e suite on its own, not alongside another Electron suite on the same machine. Investigate
    immediately if it recurs in a run on its own.
- 2026-11-05 — STORY-20 Settings:
  - Settings is a view in the main area, like Claude desktop's, not a separate window. It is reached from the sidebar,
    File > Settings… (Ctrl+,, ⌘,) and Help > Keyboard Shortcuts (Ctrl+/, ⌘/). A view shares the shell's menu,
    shortcuts and theme for free, and a second BrowserWindow would need its own preload, focus and close-to-tray
    rules. The story title's "window" is met by this page.
  - Pages, in two scopes. App: General (Close button), Appearance (Theme), Workflow, Keyboard shortcuts.
    Project: Workflow. The work settings page has the same name at both scopes (user feedback: "Work" read as the Work
    view; "Progress and review" repeated as its first section heading, so it became "Workflow"). In a plain browser tab General is left out: there is no close button.
  - Layout, after user feedback that the first version's options looked sloppy, modelled on Claude desktop and Windows
    11 Settings: content at most 720px wide and centred; titled groups, each a card of rows; a row is the label with a
    short description under it on the left and the control right-aligned, with hairline dividers. Controls are the
    app's own, in its tokens: a switch for on/off, a segmented control for two or three short choices, and a dropdown
    (listbox) for longer lists, such as the project picker. The picker sits in the Project page header ("Project:
    name ▾"), not among the settings.
  - Overrides are quiet: a setting that follows the app default shows nothing. An override shows "Overridden · Reset"
    by its label, Reset a text button; the app default is in their tooltip and in the control's accessible
    description. The UI names no file paths: the Project page says "Saved with this project (shared through git)",
    with `.featra/config.yaml` in its tooltip.
  - No repeated or idle text (user feedback): no section heading echoes its page title; a page with one group has no
    section heading; a description is shown only where it adds to the label (Theme has none; "Progress counts" became
    "Feature progress counts" instead of a description saying so); intros keep only what the user needs ("Every
    project uses these unless it overrides them."; "Saved with this project (shared through git)."). A component test
    walks every page for these rules.
  - App settings are `settings.json` in userData (`apps/desktop/src/settings-store.ts`): `{ theme, closeButton, work }`.
    The theme moved there from `ui-state.json`; a profile with no settings file yet takes its theme from there once.
    Reset App Data clears `settings.json` too; Clear Cache keeps it.
  - Work settings exist at both scopes: progress counts, Accept to be Done (`requireAccept`), worktrees, and agents and
    project knowledge. The app holds the defaults, equal to work-format's `DEFAULT_CONFIG`. A project overrides a
    setting exactly when its `.featra/config.yaml` sets the key; Reset deletes the key. Other config keys (stages,
    baseBranch, mcp…) are not app defaults and aren't shown yet.
  - `config.yaml` is edited through work-format (`setConfigValue`, `configOverrides`) with yaml's Document API:
    comments, key order and unknown keys are kept, but a trailing comment's alignment collapses to one space. A file
    that isn't valid is reported in Settings and never rewritten. `parseConfig` now also rejects non-boolean flags
    and an unknown `knowledge` value.
  - The current project, until STORY-19's project list: `FEATRA_PROJECT_DIR` if set (empty means none), else the
    nearest folder at or above the working folder that holds `.featra/`. The picker lists only that project, and main
    accepts project reads and writes only for it. E2E launches set `FEATRA_PROJECT_DIR=""` unless a test gives a
    temporary project, so no test touches this repo's own config.
  - The Close button applies at once (`lifecycle.setCloseToTray`): the tray icon exists only while close keeps
    Featra running, so main creates or destroys it when the setting changes. On macOS the choice reads "Keep running
    in the Dock". With no tray (Linux without a StatusNotifier host) the setting shows Quit, disabled, with the reason.
  - The Keyboard shortcuts page is read-only and built from the menu model (`listShortcuts(menu)`), so it lists exactly
    the shortcuts the menu shows, by menu, with `shortcuts.ts` labels. Search matches every word against name, keys
    and area. Rebinding stays on the roadmap.
  - A project change shows at once and is then replaced by what the file holds (bug found in e2e: the radio waited for
    the IPC write and a click looked ignored; regression test in `settings.test.tsx`).
