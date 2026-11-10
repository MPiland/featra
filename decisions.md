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
  - The title bar shows the view title only ("Work"). STORY-19 added the "· manager" project suffix after it.
  - Window chrome state (sidebar collapsed, zoom, theme) is `ui-state.json` in Electron's `userData`, written by main
    (atomic, flushed before quit), not renderer `localStorage`. `FEATRA_USER_DATA_DIR` overrides the folder. STORY-20
    moved the theme out to `settings.json`; `ui-state.json` keeps the sidebar and zoom.
  - Close goes to the system tray (sent back by the user): the close button and Alt+F4 hide the window and the app keeps
    running, so agent sessions carry on. STORY-20 made it the Settings > General > Close button
    setting (default Minimize to tray); set to Quit, closing quits. The logic is `apps/desktop/src/lifecycle.ts`, free of Electron imports.
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
    Electron never reports the window minimised, even a framed one (checked with plain Electron). Corrected by BUG-4:
    under WSLg `minimize()` does minimise the window on the Windows side; only Electron and X don't know it. The tray test asserts that the
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
    description. The UI names no file paths: the Project page says "Saved in the project, shared through git.", with
    `.featra/config.yaml` in its tooltip.
  - No repeated or idle text (user feedback): no section heading echoes its page title; a page with one group has no
    section heading; a description is shown only where it adds to the label; intros keep only what the user needs.
    A component test walks every page for these rules.
  - Short, standard wording, as in VS Code, Slack and Claude desktop (user feedback: "No need for all the extra words
    and flavor"): Close button "Minimize to tray" or "Quit" ("Minimize to Dock" on macOS); "Feature progress",
    "Require acceptance before Done", "Use a worktree per story", "Agent access to project knowledge" (Edit, Propose
    edits, Read only). The only descriptions left say what a label alone can't: knowledge covers "Glossary, decisions
    and ADRs.", and without a tray "No system tray, so closing quits." Intros: "Defaults for all projects." and
    "Saved in the project, shared through git."
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
  - The current project, until STORY-19's project list (now superseded, see STORY-19 below): `FEATRA_PROJECT_DIR` if set (empty means none), else the
    nearest folder at or above the working folder that holds `.featra/`. The picker lists only that project, and main
    accepts project reads and writes only for it. E2E launches set `FEATRA_PROJECT_DIR=""` unless a test gives a
    temporary project, so no test touches this repo's own config.
  - The Close button applies at once (`lifecycle.setCloseToTray`): the tray icon exists only while close keeps
    Featra running, so main creates or destroys it when the setting changes. On macOS the choice reads "Minimize to
    Dock". With no tray (Linux without a StatusNotifier host) the setting shows Quit, disabled, with the reason.
  - The Keyboard shortcuts page is read-only and built from the menu model (`listShortcuts(menu)`), so it lists exactly
    the shortcuts the menu shows, by menu, with `shortcuts.ts` labels. Search matches every word against name, keys
    and area. Rebinding stays on the roadmap.
  - A project change shows at once and is then replaced by what the file holds (bug found in e2e: the radio waited for
    the IPC write and a click looked ignored; regression test in `ProjectPage.test.tsx`).
  - Code layout, per `docs/coding-standards.md` (user feedback): the shared controls are one file each in
    `packages/client/src/components/controls/` (`Switch`, `SegmentedControl`, `Dropdown`, `SettingRow`); the pages
    are one file each in `components/settings/`, with `SettingsView` only the page list and switch. `SettingRow` hands
    its control the label and description ids through a render prop, so the id scheme lives in one place. What
    Settings shows (pages, groups, choice and override wording) is plain data in `src/settings-pages.ts`; work-setting
    lookups go through `workSettingDef`. The stylesheet is `src/styles/` by area (tokens, base, shell, titlebar, menus,
    dialog, settings, controls), joined by `styles/index.css`; the built CSS has the same rules as before. The
    component tests are split by page under `test/components/settings/`.
- 2026-11-05 — Agents get tools through MCP, so they work with any MCP-capable agent, not only Claude or Codex. Agents
  driving the in-app browser is STORY-40 in M1b (FEAT-10). Desktop computer use goes on the roadmap. Both are off by
  default, because tool definitions cost context tokens on every turn.
- 2026-11-05 — Code follows `docs/coding-standards.md`: one concern per file, no monolith files (about 300 lines is the
  signal to split), shared controls in `components/controls/`, shared helpers in topic `utils/` modules, no one-off
  helper files. A story isn't ready for review until its changes follow it. Existing code is brought in line as it's
  touched (SettingsView and the stylesheet in STORY-20); `main.ts` is split by job in a FEAT-13 refactor.
- 2026-11-05 — Professional engineering standards apply to all code: `docs/coding-standards.md` (quality gate, structure,
  TypeScript, errors, security, review checklist), `docs/architecture.md` as the code map, and ADRs for every
  architecturally significant decision (`docs/adr/README.md`). Missing ADRs 0007–0013 were backfilled from this log.
- 2026-11-05 — Lint and format use OXC (oxlint and oxfmt), with a `pnpm check` pre-commit gate (ADR 0014). Built in
  STORY-41, after STORY-20 and before STORY-19.
- 2026-11-05 — Settings copy is short and standard, the way established desktop apps word it (for example "Minimize to
  tray" or "Quit"). There's no flavour text, and a description appears only where the label alone would mislead.
- 2026-11-05 — Remote control MVP (M2) goes over Tailscale, with an SSH tunnel to the local server as an alternative.
  We don't build on Claude's or Codex's own Remote Control: it belongs to the vendor's running process, not the
  session. Imported sessions are resumed in place (as `claude --resume` does), so their turns carry over to the
  vendor's own apps the way they do natively.
- 2026-11-06 — STORY-19 (switch, create and open projects):
  - The known projects are `projects.json` in `userData`, owned by main (`project-registry.ts`), with the current
    project and the last New Project location. Reset App Data keeps it. A folder that is gone is left out of the list
    but kept in the file, so it comes back with the folder. Folders compare without case on Windows and macOS.
  - The current project at startup: `FEATRA_PROJECT_DIR` if set (pinned for that run), else the stored current one if
    its folder is there, else the nearest folder holding `.featra/`. Main accepts project settings reads and writes
    only for known projects.
  - New Project… creates an empty folder and opens it. Setting up git and `.featra/` in it belongs to STORY-2 and
    STORY-33. The dialog checks the name as you type with the shared `projectNameError` (Windows' forbidden characters
    and reserved names on every platform, so a project moves between machines); main checks again. Location defaults
    to the last one used, else the folder the current project is in.
  - Shortcuts: New Project Ctrl+Shift+N (Ctrl+N stays New Chat), Open Folder Ctrl+O, Project Settings Ctrl+Shift+,.
    In a browser tab New Project and Open Folder are left out and their shortcuts ignored.
  - The switcher is the sidebar's first control, a `MenuButton`: known projects as a checked list, then New Project…,
    Open Folder…, Project Settings…. Project Settings… always opens Settings' Project page on the current project.
  - Switching re-keys Work and the chat list on the project folder, so their state starts fresh. The title bar shows
    "· name" after the view title; the window title stays "Featra · View". With no project, Work offers New Project…
    and Open Folder…. A switch or open that main refuses shows a "Can't Open Project" dialog with the reason.
  - E2E fakes only the OS folder dialog: tests queue the folders it returns (`queueFolderPicks`).
- 2026-11-06 — BUG-2 (tray restore focus in e2e): Windows' foreground lock refuses `focus()` to a process that didn't
  get the user's last input. A real tray click, tray-menu choice or Start-menu relaunch gives Featra that right; the
  e2e harness fakes those events, so it also fakes the grant (`e2e/foreground.ts`, user32's AllowSetForegroundWindow
  through PowerShell, test-only, no npm dependency). Product code is unchanged: it still has to call `show()` and
  `focus()` itself, and the tests prove it. Focus tests assert both Chromium's `isFocused()` and the OS foreground window
  (`windowInForeground`), because `isFocused()` can say true while another app is in front (user decision).
- 2026-11-06 — BUG-3 (e2e foreground grant under the lock): only the process that got the last input can pass on the
  foreground right, so BUG-2's AttachThreadInput grant failed whenever someone was using another app. The harness now
  sends a zero-distance mouse move (SendInput) before AllowSetForegroundWindow, which makes the helper the last-input
  process, as a real tray click makes Explorer. The user32 calls go to one long-lived PowerShell per test worker
  (`e2e/user32-helper.ps1`, about 8 ms a call) instead of one PowerShell per call. The two focus tests start a
  busy-user window (`e2e/busy-user.ps1`) that keeps getting input, so the lock is on in every run instead of only when
  someone happens to be at the desktop.
- 2026-11-07 — BUG-4 (WSLg tray restore): WSLg draws each Linux window as a Windows window (msrdc.exe). There
  `focus()` doesn't bring a shown window in front of a Windows app, and `minimize()` minimises the Windows window
  while Electron and X still report it shown, focused and not minimised. Showing a hidden window always brings it to
  the front. So under WSLg (`onWslg`: Linux with `WSL_DISTRO_NAME` set) `reveal()` hides a shown window and shows it
  again. Elsewhere it is unchanged. The cost, on WSLg only: each reveal of a shown window gives it a new Windows
  window, so its taskbar button can blink, and Windows may place it as a fresh window (the e2e tests don't check
  its position). Accepted, because otherwise the window can't come back at all. In the e2e tests under WSLg, being in front means Windows' foreground window is
  msrdc's "<title> (<distro>)" and is not minimised, as well as X's active window. The busy-user window runs there
  too, through WSL's interop. No foreground grant is needed under WSLg: msrdc took the foreground every time.
- 2026-11-06 — STORY-2 (open a folder and initialise Featra): the server's process model and protocol are ADR 0015.
  Smaller choices:
  - The offer is a non-modal banner at the top of Work ("Project setup"), not a dialog. Opening a folder never blocks
    on it, and "Not now" hides it for that project until Featra restarts. The full guided setup is STORY-33.
  - Featra init needs a git repository. A plain folder is offered Initialize Git first, then Initialize Featra, so
    cards always live in git.
  - Init writes each file with create-only (`wx`), so it never overwrites, even in a race. `docs/adr/README.md` is
    seeded only when init creates `docs/adr/` itself; a user's own ADR folder is left as it is.
  - The new `config.yaml` holds only `version: 1`, so every work setting follows the app-wide defaults until the user
    overrides it.
  - Git runs with `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the other repo overrides removed from its env, so a
    caller's env (a git hook, for one) can't point it at another repository. A git error other than "not a git
    repository" (dubious ownership, for one) is shown as an error, not as an offer to run `git init`.
  - A server main stops (on quit) logs nothing: not the stop, nor the child's exit, stderr or messages after it. The
    stop is part of quitting, so "Quitting" stays the log's last line, right after the line that caused it (e2e checks
    both). A server that exits on its own is still logged with its exit code.
- 2026-11-06 — STORY-42 (init confirms what it created): after Featra init succeeds, Work shows a "Featra is set up"
  banner in place of the offer, listing what the server's `project.init` reported as Created and Kept (each list one
  wrapping line of paths; an empty list isn't shown). It is client state in memory only, kept per project until
  Dismiss. Nothing is stored to make "does not come back" hold across restarts: the confirmation exists only as the
  answer to an init in this run, and a project that is set up (`ready`) is never offered init again, so after Dismiss
  or a restart there is nothing that could bring it back. The e2e proves this with a relaunch.
- 2026-11-06 — STORY-42 rescoped to "Set up a project on one screen"; this replaces the entry above (the banner and
  its confirmation are gone). Decisions:
  - Two new server methods, `project.setupPlan` and `project.setup`, in their own file (`project-setup-plan.ts`), so
    STORY-3's server work doesn't collide. `project.gitInit` and `project.init` stay on the server, unused by the
    client, rather than being changed under STORY-3. `FEATRA_SCAFFOLD` is unchanged; the setup items map ids to its
    entries plus a starter `.gitignore` (`work-format/setup-items.ts`).
  - The setup ids, plan shape and params live in `setup-plan.ts`, apart from the items, so the preload bundle stays
    free of the scaffold's YAML dependency (the preload-bundle test caught it).
  - The client sends the ticked items and the kept ones; the server adds the required ones. Asking for kept items
    lets the result list them as Kept. A `.gitignore` that exists isn't offered or sent: the user's own is never
    merged into.
  - Workflow settings changed on the page are held until Set up, then written through the same `setProjectValue`
    storage Project settings uses, once `.featra/config.yaml` exists. A failed write shows on the result step; setup
    itself has already succeeded.
  - Skip lasts per project until Featra restarts, like STORY-2's Not now. Done closes the page for the project; it
    comes back only from Project settings > "Set up project", which switches to that project first if needed and
    opens Work.
  - The page is its own component (`ProjectSetupPage` + `useSetupPage`), with its sections in an array so STORY-33 can
    add more. WorkView only picks the page or the list. The page carries Work's `data-view`/`data-project` marks.
  - A project the server can't check shows the page with the error, Try again and Skip; a failed Set up keeps the
    page with the error so the user can retry.
  - After STORY-3 merged, WorkView shows this page or STORY-3's Work list, never both: the setup offer that sat above
    the list is gone. Done on the result step shows the list (its empty state when there are no cards).
- 2026-11-06 — STORY-3 (Work list from owner copies): the index, watching, push frames and stale-copy rules are ADR
  0016 (rules approved by the Dev Lead). Smaller choices:
  - The list replaces Work's placeholder below the setup offer. Epics start open and features start closed; what the
    user opened stays open when a new list arrives. Changing the filter starts the epics open again.
  - Filter chips show how many features each would show ("In progress · 1"). A feature can count under more than one.
    Epics left with no matching feature are hidden; an epic's own count is not filtered.
  - Features and stories are rows of one ARIA table per epic, so story rows share the feature columns. The caret column
    is spacing, hidden from assistive tech.
  - Feature statuses read as Draft, Approved, In progress, Done and Cancelled; a story's stage shows as written in the
    card. Empty counts and a missing PR show "—".
  - A stale copy is a banner above the list with Apply to owner and Discard, and the card's row carries an "Edited
    elsewhere" flag. A refusal (a conflict, an owner not
    checked out) shows on that banner; nothing is written.
  - When the connection to the server drops, the list keeps the last one it had and says why, then watches again.

## 2026-11-06 — Project setup is one guided page, built in FEAT-2

The user found STORY-2's setup banner bare, so STORY-42 replaces it with a full-page "Set up project" screen in Work.
On that screen, git, `.featra/`, each knowledge file, a starter `.gitignore` and the Workflow settings are chosen
together and applied with one action. Git still runs first, because cards need it, but the user never sees separate
steps. STORY-33 later adds its sections (artifacts, acceptance proof, role presets, agent instructions) to this page.

## 2026-11-07 — Tests run off the user's desktop, on GitHub Actions

E2e runs that take focus clashed with the user working on their only PC. So:

- The repo becomes public as `MPiland/featra`. Public repos get unlimited free minutes on standard runners. Before the
  first push, the history is checked for secrets, personal paths and email.
- CI runs Windows e2e, Ubuntu e2e (under Xvfb with a window manager) and the unit tests. All must pass before a PR can
  merge to main (branch protection), and the user's Accept is still required.
- The Dev Lead may push branches to this repo, never force and never directly to main. No other remote is pushed to.
- WSLg was only how we tested Linux, not a supported platform. Linux runs move to Xvfb on Ubuntu, both locally in WSL
  and on CI. WSLg comes off the acceptance criteria, including BUG-4's.
- BUG-4 keeps its counts on CI: 150 Windows tray runs and 20 full Linux runs, with assertions unchanged.
- A local Windows VM is the fallback only if the Windows foreground tests can't pass on GitHub's runners.

## 2026-11-07 — History rewritten before going public

Before the first push, the history was rewritten once with git filter-repo, in a separate clone. Personal paths are
masked (the user name in the spike results and docs, and `D:\dev\manager` in a mockup, a history-only cache file and
BUG-4's harness test). Every commit's author and committer email is now the user's GitHub noreply address, which all
future commits use too. Local branches were moved onto the rewritten history, and branches already merged under the
old history were deleted. The repo is public at https://github.com/MPiland/featra.

## 2026-11-07 — BUG-5: card edits stay fast on a busy PC

BUG-5 had two causes. The first is a race in the work watch: a listener that joins as the last one leaves never gets
pushes. That broke CI. The second is speed. Each rescan ran about 4 git commands in series, which takes 1.5–2.7 s
when other sessions load the PC. Featra normally runs next to many agents, so the user chose to fix the speed inside
BUG-5: a card-only edit rescans from disk and reuses git state unless refs, HEAD or worktrees changed (ADR 0016 is
amended). STORY-3's 1 s and 2 s criteria stay as written. The unit-test time limit goes from vitest's 5 s default to
30 s, because it only catches hung tests and slow but correct tests failed under load.

BUG-5 lands through STORY-43's branch, since main has no CI workflows until FEAT-18 merges.

## 2026-11-08 — BUG-6: the server's own writes reuse the watch's git answers

BUG-6's cause was serial git starts. Under the full parallel unit run, each git start takes 150–1100 ms. Apply ran
about nine in a row: a full scan, the restore, and then a refresh that forced git again, though writing a card and
`git restore` change no ref, HEAD or worktree. That took 2.1–3.3 s. A new watch's first scan ran four rounds and
took 1.2–2.6 s. Both missed the AC6 test's 2 s wait. Now apply, discard and card edits scan through the watch both
before and after they write, and reuse its git part unless a git target fired. A fresh scan reads every rev's card
tree and the missing blobs through one `cat-file --batch`, so it takes three rounds. Apply now runs one git command
and answers in 0.35–0.7 s, and the first watch answer takes 0.8–1.0 s. ADR 0016 and ADR 0017 are amended. The test
and its 2 s wait are unchanged.

Reuse is only safe if every git change fires a git target, and removing a worktree did not. Git deletes
`worktrees/<name>` as one folder, which the `HEAD`/`gitdir` name filter dropped. Windows also keeps reporting a
deleted folder under a recursive watch by its absolute path, and each of those events reset the 50 ms settle, so the
rescan never ran. Each worktree's folder, and the `worktrees` folder itself, now count as git targets. An event that
names the watched folder itself closes that watch, like a watcher error. Tests for both cases failed before the fix.

## 2026-11-08 — Unit soaks run on CI's Windows runner

BUG-6's AC2 asked for 50 full `pnpm test:unit` runs in a row on Windows. On the user's PC, AC6's only failure in the
timed soak came during a stall of the whole machine: for 4.4 s no git returned in any of the 8 test processes. Cutting
a git round would not have saved it, and the 2 s wait is what STORY-3 promises. So the user moved AC2's 50 runs to CI's
Windows runner, the same as the e2e soaks, with the 2 s wait and every assertion unchanged. `soak.yml` now repeats
the whole unit suite too (`soak/windows/unit/50`), stops at the first failing run and keeps every run's output.

## 2026-11-08 — FEAT-3 shaped: sessions, roles, approvals and decision logging

- STORY-5 is split into three stories: start and stream a chat (STORY-5), inline tool approvals (STORY-45) and agent
  questions as cards (STORY-46). Moving waiting items to the Inbox is STORY-7. Why: each one is a separate behavior the
  user can accept on its own, and the original card was too big for one PR.
- Chats survive a restart (STORY-44). Featra keeps a small index (session id, title, project, role) in app data,
  reads the transcript from Claude's own session file and resumes through the SDK. Rejected: chats that last only
  until quit.
- A role's prompt is appended to Claude Code's system prompt, so CLAUDE.md, skills and hooks still apply.
- Permission mode is per role. All five built-in roles start at Ask. Rejected: one global Ask with no role field.
- Agents decide what to log, through the Featra MCP's `log_decision` and `defer_question` (STORY-47). Each entry
  records the decision, why it was made, the alternatives rejected, and the session and card. The chat shows
  "Logged to decisions.md" with Undo. Why: the user wants a later agent to understand why a choice was made, and
  logging every answer would bury the real decisions under trivia. Rejected: a "Save as decision" box on each
  question card, and logging every answer. The rule taught in the tool descriptions is modelled on the escalation
  list in artificer-toolkit's AGENTS.md.
- The Featra MCP server (`packages/mcp`) is built in FEAT-3 (STORY-47), and FEAT-4 adds `draft_cards` to it. Before
  this, no card built it.
- An approval or question moves to the Inbox after 10 minutes, set in Settings › App. Why: by then the person is
  away, not just busy elsewhere on the PC. Desktop notifications fire at once when Featra isn't focused, and can be
  turned off. Rejected: a 2-minute wait.
- Roles live in committed `.featra/roles/*.md`. The five built-in roles stay built in until edited, so they keep
  getting Featra's prompt updates. Users can create, duplicate, rename and delete their own roles.
- Provider agent definitions are read live as roles, one reader per provider: Claude's `.claude/agents/*.md` and
  Codex's `.codex/agents/*.toml`, project and user level. Featra never writes to them. Customize copies one into
  `.featra/roles/`. Both readers ship in M1; until Codex sessions exist, a Codex role starts a Claude session with
  its prompt, and its model falls back to the Claude default. This amends the 2026-11-04 entry: Codex sessions are
  still M2, but reading Codex roles is M1. Other providers get a reader when they document an agent format.
- FEAT-3's tests fake the Agent SDK at the package boundary, and Featra's own session code runs for real.
- FEAT-3 gets a feature branch, and each story gets its own worktree.

## 2026-11-08 — STORY-5: start a chat from a role and stream it

- Built-in role models and efforts: Researcher sonnet/medium, Analyst/Refiner opus/high, Dev Lead opus/high,
  Developer sonnet/high, QA sonnet/medium (see `work-format/roles`). Why: shaping and orchestration want the strongest
  model; research, building and checking run longest, so they use the faster one. STORY-6 makes them editable.
- The agent gets Featra's environment minus `ELECTRON_RUN_AS_NODE`. Why: the user's `claude` must see their own PATH,
  proxy and config variables, and that one variable would make an Electron-launched `claude` act as plain Node.
- Logged out is read only from the SDK's `error: "authentication_failed"`, never from a credential file. The copy points to `claude` in a terminal and offers no login. Why: Featra never handles a vendor
  login (ADR 0007).
- The agent starts on the chat's first message, not on New chat. Why: an empty chat costs nothing and a missing or
  logged-out `claude` is reported where the user is looking, under their message.
- Subagent (Task) messages are left out of the transcript; the Task call shows as one tool row. Why: their text would
  interleave with the main reply. A later story can open a subagent's transcript.
- Chats live in the server's memory until STORY-44 stores them.
- The Agent SDK is external to the desktop bundle and loaded with a dynamic `import()` on first use. Why: it ships its
  own `claude` binary lookup and native pieces that bundling breaks, and startup shouldn't pay for it. Its licence is
  not MIT; ADR 0007 already accepted it.
- The chat view isn't in navigation history or the sidebar's chat list yet; STORY-21 adds both. Opening any sidebar
  entry leaves the chat. The sidebar gets the New chat button now, above Work.
- The client keeps a `chat.event` push that arrives before the `chat.watch` answer and applies it after the log, and
  drops a malformed push. Both were bugs found by tests: the push was lost, and a malformed one wiped the chat.
- The installed SDK's `canUseTool` also takes a `requestId`; the test fakes pass one.

### Review fixes (PR #7)

- Logged out no longer matches login phrases in the result or the reply; only `authentication_failed` counts. Why: a
  reply that mentions logging in (or a failure that does) was hidden behind the logged-out line. A failed result now
  shows its own message.
- The copy is one short sentence each: "Claude Code isn't installed." and "Claude Code isn't logged in. Run claude in a
  terminal to log in." Why: short standard UI copy.
- The server's chat copy (`CHAT_MESSAGES`) lives in `work-format/chat-events`; the client's own labels stay in
  `chats.ts`. Why: the server, the tests and the e2e journey share the refusals, so one place keeps them from drifting.
- Stop only marks a turn that is running: before the agent starts it ends the turn as stopped and the next message
  starts afresh; after the turn ended it does nothing. Why: a Stop during the lookup or at a turn's end left a flag
  set, and the next turn ended "Stopped".
- A failure outside the stream (the `claude` lookup throwing) ends the turn as failed. Why: the rejection was left
  unhandled and the turn never ended.
- A watcher that throws is logged and the chat carries on. Why: one broken socket shouldn't end a chat for every view.
- A tool request cut short by Stop or close shows as stopped on its row, not Denied. Why: the user stopped it; nothing
  denied it.
- A project the user closes ends its chats, and `chat.event` pushes check the project is still open. Why: like
  `work.watch` and `card.view`, a page may only act on open projects.
- A failed Stop shows its error in the chat view. Why: it was swallowed, so the user didn't know Stop hadn't happened.
- `claude-locate` reads a Windows lookup's paths with `path.win32` on every host. Why: on Linux the host `join` made
  `C:\npm/node_modules/...`, so CI couldn't follow the npm shim (the same class of bug as `copyName`).
- The chat header reads "model · effort · Ask", like the role picker. Why: the parts ran together as "sonnethighAsk".
- 2026-11-09, user decision ("Add New chat to list"): the sidebar keeps New chat above Work, and STORY-18's shell
  journey (`e2e/shell.spec.ts`, both sidebar checks) and `app.test.tsx` expect it. Why: the PR changed the sidebar on purpose; the tests
  follow the intended sidebar, with every other check left as it was.
- The located `claude` path is used as `where`/`which` print it, not canonicalized. Why: it is what the user's shell
  runs, and it is only spawned, so an 8.3 short or long form names the same file; a `realpath` adds a filesystem call
  and changes nothing. The chat e2e names its stand-in with `realpathSync.native`, as `where` does, so its exact
  options check holds on Windows runners whose temp folder is a short path.

## 2026-11-09 — STORY-21: chat list grouped by provider

- The server builds each chat's row (`ChatSummary`, `work-format/chat-list`) from the same events as its log, and
  pushes the project's list over `chat.list` (ADR 0018). Why: one copy of the rules, and the client never folds every
  chat's log just to draw the sidebar.
- A row's title is the first line of the user's first message, cut to 60 characters; before that the row shows the
  role's name. Why: the first message is what the chat is about, and a new chat still needs a name.
- Groups come from the registered adapters, each with its own `name` and `installed()`; a provider shows when it is
  installed or still has chats. Why: AC2 says not to hard-code Claude, and a chat never goes missing from the list.
- Waiting: a turn that ends done or failed waits for the user's reply; one the user stopped doesn't; a message clears
  it. A streamed delta changes no row, so it pushes no list. Why: "waiting" means the agent is done and the user has
  to act; after Stop the user already acted. STORY-45 and STORY-46 add their reasons to `WaitReason`.
- File > New Chat (Ctrl+N, ⌘N on macOS) is the File menu's first item, then a separator, then New Project…, Open
  Folder…, a separator and the rest, unchanged. A browser tab leaves New Chat out and keeps Ctrl+N for the browser.
  This follows the user-approved AC4, decided by the Dev Lead. Six tests that listed the File menu or Ctrl+N were
  updated to it, every other check unchanged: `shortcuts.test.ts` (Ctrl+N is New Chat), `ShortcutsPage.test.tsx`
  (newChat listed), `menu.test.tsx` (New Chat in the PC and macOS lists, one more ArrowDown), `e2e/projects.spec.ts`
  (`slice(1, 5)`), and `projects.test.tsx` "uses Cmd on macOS" (`slice(1, 4)` with the same three labels, plus item 0
  is "New Chat⌘N", so the start of the File menu stays fully checked).
- New Chat without a project opens Work, where the user can open one. Why: the chat needs a project to run in.
- Chats join Back/Forward history (`chat:<id>` entries), as STORY-5 said STORY-21 would. Opening a chat from the list
  is one navigation, like a sidebar view.
- The list holds this run's chats; STORY-44 saves and loads the manager's chat map and rows.
- The e2e chat journeys share the stand-in `claude` setup (`e2e/agent.ts`). Why: two specs copying it would drift.

### Review fixes (PR #8)

- `chat.list` looks for the providers again on each push, not once per watch, and sends only the newest push. Why:
  a `claude` installed after launch never showed its group. The lookup is one PATH search per list change (a chat
  starting, a message, a turn ending), which is cheap; sending only the newest keeps a slow lookup from sending an
  older list last.
- Switching project leaves the old project's chats: a chat in front gives way to Work, and the history drops the
  old project's chat entries (`leaveChats`). Why: a bug. The chat stayed in front over the new project and Back
  reopened a chat the new project doesn't have. Regression test in `chat-list.test.tsx`.
- The "no group for a provider that isn't installed" test waits until the list has arrived. Why: it could pass
  before the list loaded; it now fails when the filter on `installed` is taken out.
- Seen while building, not caused by this story: `ws-work.test.ts` (card.watch, "No matching frame in 2000 ms") and
  `card-pane.test.tsx` ("opens beside the list…") each failed once under a full parallel run and passed on retry.
  On the PR's first CI run, E2E (Ubuntu) failed once in `settings.spec.ts` (keyboard theme change): `settings.json`
  was read before it was first written (ENOENT inside `expect.poll`).

## 2026-11-09 — STORY-44: chats come back after a restart

- The transcript is read with the Agent SDK's own session reader (`getSessionInfo`, `getSessionMessages`), not by
  parsing Claude's `.jsonl` files. Why: the format and location are Claude's; the SDK keeps up with them, skips corrupt
  lines, and reading runs no agent, so it costs no tokens. It sits behind `ProviderAdapter.history`, so the manager and
  the protocol name no provider.
- `chats.json` in the app's data folder holds each chat's project, session id and row. The desktop passes the folder
  to the server as `FEATRA_DATA_DIR`. Why: AC1, and the server owns the chats. `json-store` moved from the desktop to
  `@featra/server/json-store` so both use one atomic writer.
- Reset App Data keeps the chats. Why: it resets settings and window state; chats are the user's work, and their
  transcripts live in Claude's own files, which Featra never deletes.
- A restored chat is listed at once but read only when opened. Why: a long chat list shouldn't read every session file
  at start-up. Turns read back from history end as done; a stopped or failed turn isn't recorded in the file.
- A chat whose session file is gone stays listed, shows "This chat's history is gone." with a New chat button (same
  role, same project), and hides the composer; the server refuses a message to it. Why: AC4; the user sees why, and
  the chat doesn't silently start a new session under the old title.
- A closed project's chats are kept (saved, out of the list) and come back when it is opened again. Why: closing a
  project isn't deleting its chats.
- A new session id is saved but pushes no list. Why: the row doesn't show it, and STORY-21 says a push is a row change.
- Tests fake only `query`, the clock and Claude's folder: `CLAUDE_CONFIG_DIR` points the real reader at a temp folder,
  and test helpers (`claude-sessions.ts`) and the E2E fake SDK write session files there as Claude does. The fake SDK
  only writes when `CLAUDE_CONFIG_DIR` is set and logs `resume` only when it is set, so other journeys are unchanged.
- `chat-manager.ts` stays under 300 lines: saving and the history read live in `chat-store.ts`, and the list's
  watchers in `chat-list-watch.ts`.

### Review fixes (PR #9)

- `chats.json` is read strictly (`JsonStore.read`): a missing file is no chats, one that isn't JSON is renamed to
  `chats.json.bad` and the app starts afresh, and any other read error (EBUSY from antivirus, EACCES) is logged and the
  file is not saved over that run; the run's chats stay in memory. Why: a bug. One locked read at start-up read as "no
  chats", and the next save wiped every saved chat. The desktop's own stores keep the lenient `load`: they are
  settings, and they load at start-up where a rejection would stop the app. Regression tests in `chat-restore.test.ts`.
- Chats compare project folders through `projectKey`, exported from `allowed-projects.ts`, so `D:\Dev\Foo` and
  `d:\dev\foo` are one project on Windows and macOS. Why: a bug; a project reopened under another case showed no chats.
- A session id is saved once the agent answers, not on `started`. Why: a bug. A chat stopped, or an app that crashed,
  before Claude wrote the session came back as "history is gone"; it now comes back as a fresh chat.
- `chat.list` waits for the saved chats to be read before it answers (`ChatManager.ready`). Why: a bug. On a slow
  disk the first list after a restart came back empty. Regression test in `ws-chat-restore.test.ts`.
- The E2E fake SDK names a session's folder after the cwd's real path (`realpathSync.native`), as Claude does. Why: the
  fake was wrong, not the product. On the Windows runner the temp folder is an 8.3 short path (`RUNNER~1`); the SDK's
  reader spells it out in full before it looks for the session, so it never found the fake's file and the restored
  chat read as gone. Checked locally against the real reader under a short path: the old fake's session is not found,
  the new one's is.
- Known limits, not changed here: restored chats load before their project is opened (the API still gates them with
  `allow`), and the session file is read whole, with no size cap.

## 2026-11-09 — STORY-45: inline tool approvals

- Allow for this chat is kept in the server's memory only, per chat, and ends with the chat's agent (Stop leaves it;
  closing the chat or its project, or a restart, forgets it). Featra doesn't pass the SDK's `updatedPermissions`
  (superseded below: a provider's rule, for its session only). Why:
  the brief; nothing Featra does should write to the user's own Claude settings, and a rule outliving the chat would
  allow calls the user never saw.
- (Superseded below.) Allow for this chat matches a shell tool (Bash, PowerShell) by its exact command, and any other
  tool by its name.
  Why: allowing `npm test` must not allow `rm -rf .`; for the file and web tools the name is the permission the user
  is thinking of, and a per-path rule would ask again on every file.
- A call the SDK marks `suppressAlwaysAllowRule` is never covered by a rule and offers no Allow for this chat; the
  server refuses one (`onceOnly`). A request that doesn't say (`forChat` missing on the wire) offers none either. Why:
  the SDK says those calls may only be allowed once; the safe default is to ask.
- `defaultToNo` is ignored: no button is focused for the user. Why: focusing Allow or Deny would make Enter answer for
  them.
- An unanswered request: Stop cancels it through the SDK's abort signal (`approval-cancelled`) and the row shows
  Stopped; the SDK cancelling it on its own shows Cancelled; closing the chat ends it quietly; after a restart, a call
  with no result in a finished turn shows Cancelled. Never Denied, since the user didn't deny it. The agent is told
  "The request was cancelled before the user answered." Why: the brief.
- The waiting reason stays in work-format: `AskReason` (`"approval"`, STORY-46 adds a question) and `ChatRow.asks`
  beside the row. The oldest open request sets `waiting`; a saved or restored row waits on a reply, never a request.
  Why: the STORY-21 seam, extended so STORY-46 adds one reason and one event, nothing in the list or saving.
- `tool-allowed` carries the tool's name and input, like `tool-denied`. Why: a bug found in testing. The SDK's
  permission callback can run before its assistant message reaches the chat, and an Allow for this chat that arrived
  first was dropped, so the row showed no mark. Regression test in `chat-approvals.test.ts`.
- A denied call shows the user's reason on its row. Why: the user sees what the agent was told.
- STORY-7 seam: `SDK_PERMISSION_MODES` maps each role's `PermissionMode` to the SDK's; only `ask` exists until STORY-7
  adds more. STORY-46 seam: `AskReason` and `nextAsks`.
- `chat-manager.ts` stays under 300 lines: the approval desk is `approval-desk.ts`, `ChatError` is `chat-error.ts`,
  and the manager's interfaces are `chat-manager-types.ts`.

### STORY-5 checks changed (follows STORY-45 AC1–2, decided by the Dev Lead)

STORY-5's auto-deny existed only until this story; STORY-45 AC1–2 replace it with the user's answer.

- `packages/server/test/chat-session.test.ts` (AC5). Old: "until approvals exist, a tool that needs one is denied";
  `canUseTool` answered with no user action, `{ behavior: "deny", message: CHAT_MESSAGES.denied }`, and the row
  `denied: true` with result `CHAT_MESSAGES.denied`. New: "a tool that needs approval, denied by the user, shows as
  denied"; the user denies through `manager.approve`, `{ behavior: "deny", message: denyMessage() }`, and the row
  `denied: true` with result `denyMessage()`.
- `apps/desktop/e2e/chat.spec.ts`. Old: title "…denies what needs approval…"; the Bash row read `Bashnpm testDenied`
  with no user action and the log showed `CHAT_MESSAGES.denied`. New: title "…asks before a tool that needs
  approval…"; the user clicks Deny in the inline prompt, then the row reads `Bashnpm testDenied` and the log shows
  `denyMessage()`.
- `CHAT_MESSAGES.denied` ("Featra can't ask for approval yet…") is removed; grep found no other use.

### Review fixes (PR #10)

Each fix has a regression test in `packages/server/test/chat-approvals-review.test.ts` that failed before it.

- Allow for this chat on a shell tool keys on the whole input except `description`, `timeout` and
  `run_in_background` (`SHELL_FIELDS_IGNORED`), as sorted-key JSON. Why: a rule on `npm test` covered the same command
  with `dangerouslyDisableSandbox: true`. Fail closed: any field not known to be harmless, including one the SDK adds
  later, changes the key, so the user is asked again. The SDK's tool input types couldn't be read in this session, so
  the ignored list is only the fields known not to change what runs.
- The same tool call asked again (same id) ends the first request with `APPROVAL_CANCELLED` and no event, then waits
  on the second. Why: the first caller hung forever.
- The agent failing aborts the turn before its events are relayed. Why: a request it was waiting on stayed pending,
  so the chat kept waiting on an approval nobody could answer.
- A request ended by Stop, the SDK's signal or the chat closing denies with `interrupt: true`. Why: the agent was free
  to try another step after the user stopped it. The earlier Stop, cancel and close checks in `chat-approvals.test.ts`
  now also expect `interrupt: true` (strengthened, not weakened).
- The desk checks a stopped turn before the chat's rules, and offers Allow for this chat only when the request says
  `forChat: true`. Why: a rule allowed a call after Stop, and a request that didn't say defaulted to offering it.

### Allow for this chat: the provider's rule first (decided by the user, 2026-11-09)

The user decided the scope of Allow for this chat after the PR #10 review; it replaces "any other tool by its name".

- The provider's own rule comes first. When the provider suggests a rule for a request, Allow for this chat applies
  it for this session only, and the provider does the matching. Why: the provider knows its own tools' permission
  shapes (prefixes like `npm test:*`, domains) better than Featra can, and its matching stays in step with it.
- It is an optional capability of the adapter seam: `ToolRequest.suggested` (`rule`, opaque to shared code, and a
  `covers` line), answered by `ToolDecision.rule`. Why: every provider must work; Codex (M2) fills it in later, and
  nothing Claude-specific is in the desk, the manager or work-format.
- Claude: the SDK's `canUseTool` `suggestions` are `PermissionUpdate`s (checked against the SDK's TypeScript reference
  and permissions docs, and typechecked against the installed SDK's `PermissionUpdate`). Bash suggestions name the
  `localSettings` destination, which writes `.claude/settings.local.json`. Featra keeps only `addRules` updates with
  `behavior: "allow"`, sends them back as `updatedPermissions` with their rules unchanged but `destination: "session"`
  ("Current session only"), and drops `setMode`, `addDirectories` and the rest. Why: never write the user's Claude
  settings, and Allow for this chat never widens more than a rule (a mode change would allow every edit). The SDK
  checks allow rules before `canUseTool`, so a later matching call is allowed without reaching Featra.
- `suppressAlwaysAllowRule` still turns Allow for this chat off. The SDK documents it as "don't offer a persistent
  always-allow choice for this request". A session rule isn't written anywhere, but for the user it is still an
  always-allow for the rest of the chat, and the docs don't say the flag only concerns settings files. Fail closed:
  such a call offers only Allow and Deny, and no rule (the provider's or Featra's) covers it.
- Without a suggestion, Featra's own rule (`chatRule`, `work-format/chat-rules.ts`): a shell tool by the exact command
  plus every field that changes how it runs; Write and Edit only for paths inside the chat's working folder, never
  under `.git` or `.claude` at any depth, with `..` resolved first, `~` and drive-relative paths treated as outside,
  and Windows paths compared without case; WebFetch per domain (http and https only); MCP tools per tool. Any other
  tool has no rule, so Allow for this chat isn't offered and it is always asked about. Why: the user's list; anything
  Featra can't place fails closed. Links are resolved first (superseded below: "Allow for this chat: Write and Edit
  decide on real paths").
- Copy: the `approval` event carries `covers`, a short line built from the rule ("npm test commands", "This command:
  npm test", "Edits in this folder", "Fetches from example.com"), shown as the Allow for this chat button's
  description. It replaces the client's `chatRuleText`. Why: the user's copy decision; the server knows which rule
  applies, the client doesn't.
- This PR's own earlier checks that changed with the decision: `work-format/test/approvals.test.ts` keyed any
  non-shell tool by name (`chatRuleKey("Write", a)` equal to `chatRuleKey("Write", b)`) and said "Bash: npm test, in
  this chat"; those moved to `chat-rules.test.ts` with the new rules. The client check of the button's description
  and the server checks of the `approval` event now expect `covers`.
- Tests: `work-format/test/chat-rules.test.ts` (inside, outside, `.git`, `.claude`, `..` traversal, Windows paths,
  domains, MCP, unknown tools), `server/test/claude-rules.test.ts`, and `server/test/chat-approvals-suggested.test.ts`
  (Claude's suggestion passed back as a session rule; a later matching call never reaches Featra's prompt, since the
  fake SDK applies session rules as Claude does).

### Allow for this chat: Write and Edit decide on real paths (decided by the user, 2026-11-09)

The user sent STORY-45 back over the symlink limit: a link inside the working folder that points outside it was
covered by Featra's own Write and Edit rule, which checked the path as written.

- The rule now decides on real paths. The server resolves the target's real path (for a new file, its nearest existing
  folder's, with the rest appended) and the working folder's. Covered only when the real path is inside the folder's
  real path and outside its `.git` and `.claude`, and the path as written doesn't name `.git` or `.claude` either (a
  `.claude` that is itself a link still holds Claude's settings). Why: the user's decision; the rule must cover where
  the write lands, not what the path reads as.
- Work-format stays pure: `insideFolder` and `chatRule` take an optional `RealPath` resolver, and the server's
  `real-path.ts` supplies it (`realpathSync.native`). The approval desk passes it both when it offers the rule and when
  it matches a later call. Why: an injected resolver keeps the rule in one place and testable with a fake disk, rather
  than moving the check server-side and splitting it in two.
- Fails closed: a path that can't be resolved, a link whose target is gone (a write through it would create the target
  wherever it points), or a path with `..` (the OS and the tool may resolve `..` around a link differently) gets no
  rule, so the call is asked about.
- Known gap: the check runs when the call is asked about, so a link swapped between the check and the write
  (time-of-check to time-of-use) isn't caught. Claude's own sandbox and settings still apply.
- Tests: `server/test/chat-approvals-symlink.test.ts`, with real links in temp folders through the real desk (a folder
  link to outside, also after Allow for this chat on the folder; a file link to outside; a link into `.git`; a link
  whose target is gone; `..`; a link to a folder inside the project and a new file under it; a working folder reached
  through a link). Folder links are junctions on Windows, which need no privileges; the file link case is skipped where
  the system needs privileges to make one. `work-format/test/chat-rules.test.ts` covers the rule with a fake resolver.

### Role permission modes start from the provider's own settings (decided by the user, 2026-11-09)

Recorded for STORY-6, which builds it; STORY-45's AC3 (the five built-in roles default to Ask) is unchanged.

- A role starts in the permission mode the provider's own settings already use: Claude's `permissions.defaultMode`, or
  Codex's `approval_policy` and `sandbox_mode` (and its trusted-project entry). Project-level and user-level settings
  both count. With no setting, the role starts on Ask. Why: the user has already chosen how much the agent may do in
  that tool; Featra follows it rather than asking again.
- Featra reads those settings live and never writes them. It never reads credential files
  (`~/.claude/.credentials.json`, `~/.codex/auth.json`).
- Full-access modes (Claude `bypassPermissions`; Codex `never` with `danger-full-access`) are honoured, with a warning
  mark in the composer. Built-in roles never start in one on their own.
- Mode names (decided by the user, 2026-11-09): the composer's mode picker uses each provider's own mode names:
  Claude's `default`, `acceptEdits`, `plan`, `auto` and `bypassPermissions`; Codex's approval policy plus sandbox. It
  shows where the mode came from ("auto · from Claude settings"). There is no Featra-wide common set of modes. Why:
  the names match what the user already sees and sets in each provider, and a common set would hide differences
  between them.

## 2026-11-09 — STORY-46: agent questions as cards

- A question is a card on its call's own tool row (`ChatItem.question`), not a new item kind, and the AskUserQuestion
  call still has its `tool` event. Why: the SDK's callback can run before or after its assistant message, and the row
  already handles either order, Stop, a restart and a late cancel; a second item would need all of that again.
- Questions are provider neutral (`work-format/questions`: `Question`, `Answers`), and the Claude format (answers keyed
  by question text, several choices joined with ", ") lives only in `claude-question.ts`. Why: Codex adds its own
  mapping without touching the card, the events or the desk (the brief).
- Answers are `question text -> string[]` on the wire and in the log, not Claude's joined string. Why: the collapsed
  card lists each choice, and a label with a comma in it stays one choice until the adapter joins them.
- One desk, one `hold`, for approvals and questions; the provider seam gets a second handler, `ask`, beside `approve`.
  Why: they end the same ways (answer, Stop, the SDK's signal, the chat closing, the same call asked again), so the
  rules stay in one place and one test file of cancel cases covers both.
- A question ends like an unanswered approval: `approval-cancelled`, and the agent is told `APPROVAL_CANCELLED` with
  `interrupt: true`. Why: no new event for what means the same; the row shows Stopped or Cancelled, never Answered.
- A question reads as waiting (`WaitReason` `"question"`) through the same `nextAsks`, so the STORY-21 dot, saving and
  `idleSummary` needed no change. A restored chat never waits on a question, for the reason it never waits on an approval.
- `chat.answer` takes only answers that answer every question as it asks (`validAnswers`); otherwise it is refused
  (`badAnswer`) and the question keeps waiting. Why: the agent must never be handed an empty or a double answer, and the
  client's Submit is disabled on the same rule, so the server's check is for any other client.
- Other is a text field under each question, always there. For a single choice, typing in it replaces the picked option
  and picking an option clears it; for several, it adds to the ticked options. Why: one field is one gesture, and the
  user's own words win only when they wrote some.
- A call AskUserQuestion makes with questions Featra can't show (none, a blank label or question, two questions with
  one text, two options of one question with one label) is denied at once, without asking the user, and the agent is
  told to ask again with valid, distinct questions and options. Why: Allow ran the tool with no answers. Review fix;
  the Dev Lead approved it.
- Changed assertion: `packages/server/test/chat-questions.test.ts` (was line 88, "asks about a call whose questions it
  can't show as an ordinary approval") now asserts the immediate deny, no approval or question event and no waiting
  chat. Reason: Allow sent no answers.
- A `question-answered` event whose answers aren't all lists of text is rejected whole, not trimmed. Why: dropping an
  answer silently showed an answered card with less than the user chose.
- The card stays busy after a taken answer until `question-answered` replaces it. Why: a second Enter could send twice.
- Multi-select answers reach the agent joined with ", " (Claude's format), so a comma inside a label is ambiguous to
  it; noted in ADR 0018.
- There is no skip button. Stop is how the user declines to answer. Why: not in the story; a skip would need a
  product decision on what the agent is told.
- The card has no keyboard shortcut of its own: native radios, checkboxes, text fields and a form, so Tab and Enter work
  as everywhere. Enter in an Other field submits only once every question is answered.
- `tool-summary` shows the first question as the call's summary. Why: a cancelled or stopped question falls back to a
  plain row, which would otherwise show only the tool's name.
- `packages/server/test/chat-stop.test.ts`: its hand-built `SessionOptions` gained the new required `ask`. No assertion
  changed.

## 2026-11-09 — STORY-6: built-in, custom and provider roles

Roles come from three places, listed by the server's role registry and edited only in `.featra/roles/`.

- **Every role runs on Claude in M1, so Claude's settings name the mode, even for a Codex-origin role.** Why: ADR 0018
  has no Codex adapter yet, so the permission mode that matters is the one the SDK is given. The Codex reader exists
  and is tested but its mode is not used until a Codex adapter does.
- **A role file has no permission field.** Why: the mode is the provider's own setting, read live; a copy in the file
  would drift from it.
- **Rename keeps the role's id and file name.** Why: a chat and the card's `role:` refer to the id, so renaming must not
  orphan them.
- **A role's name must be unique among every listed role, provider roles included.** Why: the picker shows names, and
  two with one name cannot be told apart.
- **Claude's six modes pass through by name: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk` and
  `bypassPermissions`.** `dontAsk` is a normal Claude mode, shown as "dontAsk · from Claude settings", with no warning
  mark. Only `bypassPermissions` is full access, and it also sets the SDK's second opt-in. A value that is none of them
  starts the role on Ask with a problem and a note naming the file; the search stops there (changed in the review
  fixes below). Why: the user decided each provider's own mode names are used
  (2026-11-09); the Dev Lead decided `dontAsk` is supported, not ignored.
- **No setting means Ask, and the role carries no mode.** Why: an absent mode reads as Ask, and STORY-5's built-in role
  list stays exactly the five roles it asserted.
- **Codex: a project's `config.toml` counts only for a project the user's `config.toml` trusts, and wins per key. A
  trusted project with neither key set starts as Codex's own trusted default (`on-request`, `workspace-write`); with
  nothing set and no trust there is no mode, so Ask.** The trusted default is an assumption, logged in
  open-questions.md.
- **A model Claude doesn't have falls back to `default`, with a one-line note on the role and on the chat.** An agent's
  missing model or `inherit` is `default` without a note. Why: AC5; silent substitution would hide it.
- **An agent with no effort runs on `medium`.** Why: the SDK needs one, and it is the built-in default.
- **The composer's mode is a read-only label until STORY-22 adds the picker.** Why: STORY-22 is not part of this story.
- **The note is not kept across a restart.** Why: it comes from reading the role at start, and a restored chat reads the
  role again.
- **A project's roles are read for the chat's own folder.** Why: the same folder the chat runs in.
- **The server's default file access reads no home folder; only `main.ts` wires the real one.** Why: tests must never
  read the developer's `~/.claude` or `~/.codex`. Credential files are never read.
- **A save writes only the fields the user changed** (reverses the earlier "A prompt-only save writes the fitted
  model"; see the review fixes below).
- Files and seams: `role-registry.ts` (list, read, edit, watched), `claude-reader.ts` and `codex-reader.ts` (one reader
  per provider behind `provider-reader.ts`), `role-actions.ts` (the only writer, `.featra/roles/` only),
  `role-watch.ts` (live list, folders made after the watch began included). No new ADR: ADR 0018 gets a short note.

### STORY-20 and STORY-5 checks changed (decided by the Dev Lead)

Reason for all of them: AC1 adds Settings › Project › Roles.

- `packages/client/test/settings-pages.test.ts` (page list): "project:Roles" is appended after "project:Workflow".
- `packages/client/test/components/settings/SettingsView.test.tsx`: the Project nav buttons were `[WORK]`, now
  `[WORK, "Roles"]`; the page count was 5, now 6. The keyboard test's "project page" index is now the second to last
  button, since Roles follows it, and Roles is waited for like Workflow. Nothing was removed or relaxed.
  Two more indexes in the same keyboard walk follow from the same page (approved by the Dev Lead after the fact,
  2026-11-09): `projectLoaded()` is awaited for the last two pages (`i >= buttons.length - 2`, was the last one),
  and "Overridden" shows on the second to last page (`i === buttons.length - 2`), Workflow, not the last.
- `packages/server/test/ws-chat.test.ts` and the other STORY-5 checks are unchanged.

## 2026-11-09 — STORY-6 review fixes

- **Claude's managed settings are the highest layer** (Windows `C:\Program Files\ClaudeCode\managed-settings.json`,
  macOS `/Library/Application Support/ClaudeCode/managed-settings.json`, Linux `/etc/claude-code/managed-settings.json`),
  then local, project and user. Why: Claude applies them over every other file, so Featra must show the mode Claude
  will run. The tests never read the machine's: `RoleFs` carries the path and each test gives its own.
- **`disableBypassPermissionsMode: "disable"` in any layer (under `permissions` or at the top level) turns every
  bypass into Ask with a note**, the settings' own and an agent's. Why: Claude refuses bypass then, so showing full
  access would be wrong and unsafe.
- **A Claude agent's `permissionMode` beats the settings files for that role**, shown as "from the agent", with the
  same full-access warning. An unknown value starts the role on Ask with a problem and a note naming the file.
  Codex-origin roles stay on Claude's settings (M1). A Codex agent's `sandbox_mode` is not read (open-questions.md).
- **An unknown `defaultMode` in a higher layer no longer falls through to a lower layer** (changes the earlier
  decision that skipped it and read the next file). The role starts on Ask with a problem note naming the file. Why:
  safety: a typo must not unlock a lower layer's bypass. A file that isn't valid JSON is still skipped with a problem.
  The two tests that asserted the fall-through (`role-modes.test.ts`, work-format and server) are split: the
  malformed-file skip is unchanged and the unknown mode now asserts the stop. Both were written in this story.
- **Codex trust matches the chat folder, every folder above it (the git root among them) and, in a git worktree, the
  main checkout.** `\\?\UNC\srv\share` reads as `\\srv\share`, and UNC paths compare ignoring case. Why: Codex writes
  the entry for the repo root, and a worktree lives elsewhere.
- **New, duplicate and customized roles never overwrite a file.** The id is chosen against every file name in
  `.featra/roles/`, parsed or not, ignoring case, and the target is checked again before the write. Why: a file that
  failed to parse, or `Tester.md` beside `tester.md`, was silently replaced.
- **A save writes only the fields the user changed.** A built-in's file holds just those, so the rest keeps following
  Featra's updates; a custom role's file holds all. A blank body means no prompt, so a model-only override keeps the
  built-in's prompt. The page's prompt-save test asserted the full form and now asserts the prompt alone (written in
  this story).
- **Role watchers end when their project is closed**, not only when the socket does. Why: the project's chats were
  already closed there, and the watchers kept folders open.

## 2026-11-09 — STORY-47: Featra MCP logs decisions and open questions

- **The MCP reaches the server over a second, narrow socket (`/v1/agent`) with a secret per chat; the server takes the
  chat from the secret.** Why: the window's token opens every method, `chat.approve` among them, so handing it to an
  agent's process would let the agent approve its own tools. An agent can log into its own chat and do nothing else
  (ADR 0019).
- **`McpServerSpec` is provider-neutral, in the session options; the Claude adapter maps it to `mcpServers` plus an
  `allowedTools` rule for `mcp__featra`.** Why: a Codex or ACP adapter maps the same spec to its own config, and the
  user is not asked to approve Featra's own tools. This amends ADR 0018's "no allow lists" for that one rule (noted in
  the ADR).
- **Each entry carries a hidden `<!-- featra:ID -->` marker; Undo removes that entry's lines only.** Why: Undo must
  take back exactly what was logged, even with later entries logged or the user's own text added. If the user edited
  the entry's lines Undo refuses ("That entry was edited. Remove it from the file yourself.") so their words are never
  thrown away; if the entry is already gone it succeeds quietly, since the file is already as Undo would leave it.
- **The server is the only writer: a per-file queue, atomic temp-file and rename writes, and a missing file is created
  from the scaffold header.** Why: two agents logging at once must both land, a crash must not leave half an entry,
  and `decisions.md` may not exist yet in a project that skipped init.
- **Entries are written in the chat's working folder** (`decisions.md` and `open-questions.md` at its root). Why: the
  card's note, so they are committed with that branch's work.
- **The setting is read by the server when an agent starts and again at every log: the project's
  `.featra/config.yaml` `mcp`, else the app default in `settings.json` (read only), else on.** Why: Settings › Project
  already has the toggle and its override logic, and the server never writes the user's settings. Turning it off must
  reach chats that are already running, so a chat that is no longer offered the MCP loses its secret and a log from
  one that is off is refused with "Featra MCP is off for this project."; the Settings help says so.
- **The tool descriptions are the only instruction agents get.** Why: Featra injects no system prompt (ADR 0006), so
  each description names what to log (a choice that changes behavior or scope, a public contract, stored data or
  security, or one that picks between real trade-offs) and what not to (trivia). A tool takes more tools later:
  `draft_cards` (FEAT-4) is one more entry in the registry.
- **A bad tool input is a tool error that says what to fix; nothing is written.** Why: agents' input is data from
  outside, and the agent can correct and call again.
- **The `card` input is optional and checked as a card id.** Why: no chat knows its card yet (open-questions.md), so
  the agent says it when it knows it.
- **`logged` and `log-undone` chat events are live only: the transcript restored after a restart does not show them,
  and Undo works while the server runs.** Why: the ledger of entries is in memory and the saved transcript is the
  agent's own. The entry stays in the file for the user to edit.
- **The Featra MCP toggle joins the Agents group in Settings.** It uses the existing work-setting machinery (app
  default and project override).
- **Changed assertion: `apps/desktop/test/settings-store.test.ts` > "an override is written to config.yaml, keeping the
  file's other keys and comments" now expects `{ mcp: true, progress: "tasks" }`, where it expected
  `{ progress: "tasks" }`.** Why: the fixture's config had `mcp: true # tools for agents`, written when `mcp` was a key
  Featra didn't expose. `mcp` is now a project setting (the toggle above), so a project that sets it has an override,
  and showing it is the behavior the story adds. The fixture is as it was; only the expected overrides changed. The
  Dev Lead approved this change.
- **`knowledge: read-only` turns logging off; under `edit` and `propose` logging goes straight in.** Why: `read-only`
  is the user saying agents must not change the project's knowledge files, and `decisions.md` and `open-questions.md`
  are two of them, so under it the MCP offers no tools and a call that gets through is refused ("Logging is off: this
  project's knowledge setting is read-only."). Under `propose` the chat's Undo is the review: the entry is shown at
  once with Undo, which is a lighter check than approving first, and a decision logged only after approval would
  mostly not be logged. Whether `propose` should ask first is in open-questions.md. It replaces the earlier choice that
  logging ignores `knowledge`. The setting is the project's (and app default's) `knowledge`, as it has no per-role form.
- **A marker-looking comment in an agent's text is removed again until none is left.** Why: removing one can join the
  text around it into another, and a forged `<!-- featra:ID -->` would let one entry's Undo find another's lines.
- **A file keeps its own line endings: an entry is added in the ending of the file's last line break, and Undo removes
  lines without rewriting any other line's ending.** Why: a CRLF or mixed file would otherwise show a whole-file diff
  after one log or one Undo.
- **A write never replaces a file the user changed since it was read: the file is read again just before the rename,
  and the write starts over (up to five times) when it differs.** Why: the user may save `decisions.md` while an agent
  logs, and an atomic replace would silently drop their save. A small window between that read and the rename remains,
  which only a lock could close. The temporary file has a name of its own, and a rename that fails with EPERM or EBUSY
  (a scanner or editor holding the file on Windows) is tried again a few times before a clear error.
- **Undo also takes back the blank line `addEntry` put before the entry, when nothing follows the entry; a line added
  under the entry at any depth counts as an edit and refuses; ids are 8 random bytes and the ledger is keyed by chat
  and id.** Why: Undo should leave the file as it found it, never discard what the user wrote under an entry, and one
  chat must not be able to take back (or collide with) another's entries.
- **The server checks `dist/mcp.cjs` exists before it offers the MCP, and logs one clear error when it doesn't.** Why:
  an agent given a stdio server that can't start sees a broken tool, not a missing build. A test builds the bundle and
  runs it over stdio, so a bundle that doesn't run fails the unit tests.
- **An agent's secret is compared with the same constant-time `sameSecret` as the window's token.** Why: a guess must
  not learn anything from how long the lookup took.

## 2026-11-09 — STORY-7: question inbox and notifications

- **The Inbox is a second view of the chat's own requests, never a second way of deciding.** Its items render the chat's
  `ApprovalPrompt` and `QuestionForm` and answer through `chat.approve` and `chat.answer`; the server's Inbox only
  watches what the chat manager already holds. Why: one path means one answer is taken once, and an answer in either
  place clears the item in both because the clearing comes from the chat's own event, not from the Inbox.
- **The server holds each request with its asked time on the server's clock, and a request is due when `now - at` is at
  least the wait.** Why: the page's clock can drift or sleep with the window; the server's is the one that was running
  while the user was away. Tests move a manual clock and timers by hand and never sleep.
- **The wait is sent by the page in each `inbox.watch`, not stored by the server.** Why: Settings stays the one place
  the wait lives; a changed setting makes the page watch again, so each watcher has its own wait and nothing on the
  server needs to learn about settings.
- **The wait is 10 minutes by default and may be set from 1 second to 24 hours, fractions allowed; Settings offers
  presets (1, 2, 5, 10, 15, 30, 60 minutes) and the current value.** Why: 10 minutes is the card's decision. The
  1-second floor lets an e2e journey seed `settings.json` with 0.05 (3 seconds) and wait for the real clock instead of
  faking it; the day cap keeps a timer within what `setTimeout` can hold.
- **Notifications are decided in the main process, not the page.** The page tells main about each new request over
  `notifications:asked` (from `inbox.asked`, which pushes at once, before the wait); main checks the setting and focus
  and shows it. Why: focus is the window's, which main knows without asking the page; the setting is main's own copy.
  Electron's `Notification` is held in a set so it isn't collected before it is clicked; a click reveals the window and
  asks the page to open the chat.
- **In e2e, `testHooks` records each notification with a way to click it, and holds a focus flag the test can set.**
  Why: the OS notification centre and window focus can't be driven in CI, and the boundary faked is only Electron's
  `Notification` and the focus check, not the notifier's rules.
- **The sidebar count is the number of items in the Inbox, so it is zero while requests are inside the wait.** Why: the
  count must match what the view lists; the chat's own dot already shows an unanswered request at once. The badge's
  number is hidden from assistive tech and a "N waiting" label is read instead, set off by a comma so the name reads
  "Inbox, 1 waiting".
- **The Inbox and notifications are for the project in front.** Why: the server's watches are per project folder, as
  chats are. Notifying for a project that isn't open is in open-questions.md.
- **`ChatSummary` gains an optional `card`, set by an optional `card` in `chat.start`.** Why: AC1 shows the chat's card
  and no chat knows its card yet; STORY-9 is where a chat starts from one, and the field is ready for it.
- **The settings live in Settings › General, as the page that holds the app's other settings.** Why: the card says
  "Settings › App", and the app's settings page in this build is General. The browser tab hides the page, as before.
- **`QuestionForm` is exported from `QuestionCard.tsx`, and the Inbox reuses it.** Why: the form is the card without its
  chat frame; copying it would let the two drift.

### STORY-7 review fixes (PR #14)

- **The Inbox, its count and its notifications cover every open project; this replaces the "project in front" decision
  above.** "Open" means the projects the server holds chats for. `inbox.watch` and `inbox.asked` take an optional
  `dir`; without it they cover all of them, and the API still filters by the projects the client may see. Items carry
  `project` (the chat's folder), the view shows its name, and a click or notification switches to that project first,
  then opens the chat. Why: a request waiting in another project is as unanswered as one in front.
- **At most one OS notification per chat: a new request closes that chat's earlier toast.** Why: the chat has one thing
  to answer at a time, and a stack of stale toasts for one chat is noise. The notifier keeps the handle per chat.
- **The question notification's body is the question's text, cut to 80 characters with an ellipsis.** Why: it says what
  is asked without opening the app.
- **`inbox.opened` for a request already held changes nothing: `at` is kept and `inbox.asked` isn't pushed again.**
  Why: a repeat would restart the wait and re-notify. Regression test added.
- **Timers are per Inbox, and every scheduled one is tracked so `close()` clears all.** Why: module-global state leaked
  between servers and tests.
- **`useInbox` ignores pushes from a watch it has replaced.** Why: a late push from the old watch would overwrite the
  new list.
- **Item 1 of the review (the General page showing only when `closeToTray` is known) is not changed.** Existing
  assertions require the page hidden in that case; changing it means changing them. Left for the Dev Lead.
- **Dev Lead ruling on item 1: no change.** The desktop app always reports `closeToTray` (`closeToTraySupport` returns
  an object on every platform), so General, with Inbox wait and Notifications, is always reachable there. It is hidden
  only in a plain browser tab, which has no desktop notifications. When remote control (M2) brings the client to a
  browser, the Inbox wait must get a page of its own there.

## 2026-11-09 — STORY-22: composer controls and context meter

- **A change restarts the agent on the next send, resuming the same session; a running turn is untouched.** Why: the
  SDK takes model, effort and permission mode when the agent starts, so the supported way to change them is a new agent
  with `resume`. A change that leaves the settings as they were keeps the agent (ADR 0020).
- **Claude's `default` mode is labelled "default (Ask)".** Why: each provider's own names are used (earlier decision),
  and the label ties Claude's name to Featra's Ask.
- **Full access is offered only to a chat that started in it.** Why: Featra passes on what the user's own Claude
  settings allow; the composer never switches a chat up to a mode that runs tools without asking.
- **Changing the role resets model, effort and mode to the new role's, and the user's other choices in the same change
  apply over them; a role of another provider is refused ("That role runs on another agent.").** Why: a role is a
  prompt plus its settings, and a chat has one agent.
- **The server refuses a model, effort or mode the adapter doesn't list ("The agent doesn't offer that.").** Why: the
  adapter's controls are the one source of what is valid.
- **Usage is the last main-thread assistant message's input, cache and output tokens; the window is the result's
  `modelUsage` entry for the session's model, else the only entry, else null.** Why: the last message holds the context
  the next turn starts from; a subagent's or a second model's numbers aren't the chat's. Featra never guesses a window.
- **A `usage` event comes before `turn-end`; a restored chat reads usage from its history, without a window.** Why: the
  meter updates as the turn ends, and history has no `modelUsage`.
- **`chat.controls` and `chat.configure` are their own methods, not part of `chat.watch`.** Why: the watch snapshot is
  the event log (a test asserts it), and settings are not events.
- **The header shows what the chat runs with once a setting has been changed in the composer.** Why: it must agree with
  the controls; until then it shows what it always did.
- **The meter is hidden until the first usage, and has no `role="status"`.** Why: an empty meter says nothing, and the
  composer's full-access warning is the one status there.
- **Settings are not persisted across a restart.** Why: they aren't in the event log; logged as an open question.
