---
id: STORY-19
type: story
title: Switch, create and open projects
status: In Review
parent: FEAT-13
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-19-project-switcher-74a40e
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-06T15:36:13Z
    field: status
    from: New
    to: In Progress
    by: session:story-19
  - at: 2026-11-06T16:03:28Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-19
---

## Description

As a builder, I switch between my projects from the top of the sidebar, and add one with New project or Open folder.

## Acceptance criteria

- [x] The project switcher lists known projects and switches Work and the chat list to the chosen one (test: packages/client/test/components/projects.test.tsx AC1, apps/desktop/test/project-registry.test.ts AC1, packages/client/test/project-menu.test.ts, apps/desktop/e2e/projects.spec.ts)
- [x] New project… creates a folder and opens it; Open folder… adds an existing folder (test: packages/client/test/components/projects.test.tsx AC2, apps/desktop/test/project-registry.test.ts AC2, packages/client/test/projects.test.ts, apps/desktop/e2e/projects.spec.ts)
- [x] Project settings… in the switcher opens Settings on that project (test: packages/client/test/components/projects.test.tsx AC3, apps/desktop/e2e/projects.spec.ts)
- [x] The File menu lists New project…, Open folder… and Project settings… with their shortcuts (test: packages/client/test/components/projects.test.tsx AC4, packages/client/test/shortcuts.test.ts AC4, packages/client/test/menu.test.tsx, apps/desktop/e2e/projects.spec.ts)

## Tasks

- [x] Project list in main: `projects.json` in userData, the current project, folders that are gone left out, IPC checked
- [x] Bridge and preload: list, switch, Open Folder…, New Project… (create), Choose… location; folder dialogs faked in e2e
- [x] Reusable menu button control (`controls/MenuButton.tsx`), shared by the app menu and the switcher
- [x] Project switcher at the top of the sidebar: known projects, New Project…, Open Folder…, Project Settings…
- [x] New Project dialog: name and location, checked as you type and again in main
- [x] Work, the title bar and the chat list follow the current project; Settings' picker lists every known project
- [x] File menu: New Project…, Open Folder…, Project Settings… with their shortcuts, from the keyboard too
- [x] Unit tests for the rules; component tests; e2e journey; gate and e2e on Windows and Linux
- [x] Split `apps/desktop/src/main.ts` by job (windows, tray, menus, IPC) per `docs/coding-standards.md` before adding the project menu items

## Notes

- Decisions are in decisions.md (STORY-19): the list in `projects.json`, startup precedence, shortcuts
  (Ctrl+Shift+N, Ctrl+O, Ctrl+Shift+,), and New Project creating an empty folder (git and `.featra/` setup is STORY-2
  and STORY-33).
- The chat list is still a placeholder; it is keyed on the project, so it starts fresh on a switch.
- Removing a project from the list went on the roadmap.
- E2E: Windows 30 passed (BUG-2's tray test passed this run); WSL Ubuntu WSLg 30 passed. menu.spec.ts "Edit items act on the focused field" failed once on WSLg (Paste gave "ehello menul"): 1 failure in 31 runs on this branch, 0 in 28 on main, so it is not tied to STORY-19 yet.

## Tests

- AC1: `packages/client/test/components/projects.test.tsx` (AC1 block: the switcher, the checked list, a switch moving the title, Work and the chat list,
  keyboard, a refused switch, the no-project state); `apps/desktop/test/project-registry.test.ts` (AC1 block: the
  list, `projects.json`, restart, `FEATRA_PROJECT_DIR`, gone folders, switch checks); `packages/client/test/project-menu.test.ts`;
  `apps/desktop/e2e/projects.spec.ts`
- AC2: `packages/client/test/components/projects.test.tsx` (AC2 block: Open Folder… and cancel, the New Project dialog, live name check, Enter, Choose…, a host
  refusal, Cancel and Escape); `apps/desktop/test/project-registry.test.ts` (AC2 block: open, case rules, create,
  refusals); `packages/client/test/projects.test.ts` (name rules); `packages/client/test/bridge.test.ts` (a browser
  tab has no folders); `apps/desktop/e2e/projects.spec.ts`
- AC3: `packages/client/test/components/projects.test.tsx` (AC3 block: the Project page on the current project, every project in the picker, starting over each
  time); `apps/desktop/e2e/projects.spec.ts`
- AC4: `packages/client/test/components/projects.test.tsx` (AC4 block: File menu items, the shortcuts, Cmd on macOS); `packages/client/test/shortcuts.test.ts`
  (AC4 block); `packages/client/test/menu.test.tsx` (File menu per platform); `packages/client/test/menu-commands.test.tsx`
  (a browser tab); `apps/desktop/e2e/projects.spec.ts`
