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
