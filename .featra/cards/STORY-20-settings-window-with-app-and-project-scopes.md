---
id: STORY-20
type: story
title: Settings window with app and project scopes
status: In Progress
parent: FEAT-13
order: 3
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
  - at: 2026-11-05T21:07:13Z
    field: status
    from: New
    to: In Progress
    by: user
  - at: 2026-11-05T23:47:54Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-20
  - at: 2026-11-05T23:48:49Z
    field: status
    from: In Review
    to: In Progress
    by: session:story-20
  - at: 2026-11-06T00:05:07Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-20
  - at: 2026-11-06T00:14:27Z
    field: status
    from: In Review
    to: In Progress
    by: user
  - at: 2026-11-06T00:21:06Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-20
  - at: 2026-11-06T00:23:32Z
    field: status
    from: In Review
    to: In Progress
    by: user
---

## Description

As a builder, I change app-wide and per-project settings in one Settings window.

## Acceptance criteria

- [x] Settings has an App scope and a Project scope with a project picker that defaults to the current project (test: packages/client/test/components/settings/SettingsView.test.tsx AC1, apps/desktop/e2e/settings.spec.ts)
- [x] App settings are stored in the user's config folder; project settings in .featra/config.yaml (test: apps/desktop/e2e/settings.spec.ts, apps/desktop/test/settings-store.test.ts, packages/work-format/test/config.test.ts)
- [x] A project value that overrides an app default is labelled as an override and can be reset (test: packages/client/test/components/settings/ProjectPage.test.tsx AC3, apps/desktop/e2e/settings.spec.ts)
- [x] Every setting is reachable and changeable by keyboard (test: packages/client/test/components/settings/SettingsView.test.tsx AC4, apps/desktop/e2e/settings.spec.ts)
- [x] Settings… in the File menu (Ctrl+,) opens the Settings window (test: packages/client/test/components/settings/SettingsView.test.tsx AC5, apps/desktop/e2e/settings.spec.ts)
- [x] App settings include "Close button: keep running in the tray / quit", default keep running; it applies without a restart (test: packages/client/test/components/settings/GeneralPage.test.tsx AC6, apps/desktop/e2e/settings.spec.ts)
- [x] Settings has a Keyboard shortcuts page listing every shortcut by area, searchable; Help > Keyboard shortcuts and Ctrl+/ open it (test: packages/client/test/components/settings/ShortcutsPage.test.tsx AC7, apps/desktop/e2e/settings.spec.ts)
- [x] Settings > Appearance has a Theme choice (System, Light, Dark), default System; the choice survives a restart (moved here from the View menu) (test: packages/client/test/components/settings/AppearancePage.test.tsx AC8, apps/desktop/e2e/settings.spec.ts)

## Tasks

- [x] work-format: project overrides (`configOverrides`) and in-place edits (`setConfigValue`) of config.yaml
- [x] Settings model and bridge (`packages/client/src/settings.ts`, `bridge.ts`, preload)
- [x] Settings view: pages, scopes, picker, override mark and Reset, shortcuts page with search
- [x] Layout rework after review: rows in titled cards, switch, segmented control and dropdown, quiet "Overridden · Reset", picker in the Project page header, no file paths in the UI, the work page renamed (now "Workflow")
- [x] Text pass after review: no repeated headings or descriptions that restate labels
- [x] Help > Keyboard Shortcuts and Ctrl+/; shortcuts listed from the menu model
- [x] Main: settings store, current project, IPC, Close button at runtime with the tray following it
- [x] Styles meeting WCAG AA in both themes (contrast e2e walks every Settings page)
- [x] E2E journey; runs on Windows, WSLg and xvfb-run
- [ ] Coding standards: controls in `components/controls/`, one page per file, page model in `settings-pages.ts`, styles split by area, tests split by page
- [ ] Shorter, standard setting wording ("Minimize to tray" / "Quit"; no flavour text)

## Notes

- Settings is an in-app view, not a separate window: see decisions.md (STORY-20).
- E2E after the text pass: Windows 29 passed; WSL Ubuntu WSLg 29 passed; xvfb-run 28 passed, 1 skipped (BUG-1's
  maximize test: xvfb has no window manager). Unit: 235 passed.
- Bug found and fixed: a project change waited for the write before showing; regression test in `ProjectPage.test.tsx`.
- Sent back by the user (2026-11-05): "Any repetitive text, unnecessary text, etc" and "Duplicate heading" (the
  Project page title repeated as its first section heading). Fixed: the page is "Workflow", single-group pages have
  no section heading, descriptions that restated labels are gone; regression test "no page repeats itself".
- Bug found and fixed: work-format dropped the wrapped lines of a checklist item when it rewrote a card (a status
  change lost half of a task here); regression test in `packages/work-format/test/card.test.ts`.
- Sent back by the user (2026-11-06) for the coding standards (`docs/coding-standards.md`: one concern per file,
  shared controls in `components/controls/`, no file over about 300 lines) and for shorter, standard setting wording
  ("Minimize to tray" or "Quit", no flavour text).

## Tests

- AC1: `packages/client/test/components/settings/SettingsView.test.tsx` (AC1 block: scopes, picker in the header, picker keyboard);
  `apps/desktop/e2e/settings.spec.ts` "a project override is written…"
- AC2: `apps/desktop/e2e/settings.spec.ts` "a project override is written…" and "keyboard only…" (settings.json);
  `apps/desktop/test/settings-store.test.ts`; `packages/work-format/test/config.test.ts` (`setConfigValue`, `configOverrides`)
- AC3: `packages/client/test/components/settings/ProjectPage.test.tsx` (AC3 block: "Overridden · Reset", hidden when following the default,
  Reset, optimistic change regression); `apps/desktop/e2e/settings.spec.ts` "a project override is written…"
- Controls: `packages/client/test/components/controls/` (Switch, SegmentedControl, Dropdown, SettingRow) and
  `packages/client/test/settings-pages.test.ts` (pages, groups, wording)
- AC4: `packages/client/test/components/settings/SettingsView.test.tsx` (AC4 block: Tab reaches every setting; arrows on the segmented
  control, Space and Enter on a switch, Enter on Reset); `apps/desktop/e2e/settings.spec.ts` "keyboard only…";
  `apps/desktop/e2e/contrast.spec.ts` (every Settings page and the open picker, both themes)
- AC5: `packages/client/test/components/settings/SettingsView.test.tsx` (AC5); `apps/desktop/e2e/settings.spec.ts` "keyboard only…"
- AC6: `packages/client/test/components/settings/GeneralPage.test.tsx` (AC6); `apps/desktop/e2e/settings.spec.ts` "the Close button setting
  applies at once…" and "with no tray…"
- AC7: `packages/client/test/components/settings/ShortcutsPage.test.tsx` (AC7); `apps/desktop/e2e/settings.spec.ts` "Ctrl+/ and Help >
  Keyboard Shortcuts…"
- AC8: `packages/client/test/components/settings/AppearancePage.test.tsx` (AC8); `apps/desktop/e2e/settings.spec.ts` "keyboard only…"
