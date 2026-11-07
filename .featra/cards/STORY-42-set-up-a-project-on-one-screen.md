---
id: STORY-42
type: story
title: Set up a project on one screen
status: In Progress
parent: FEAT-2
order: 4
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T23:42:10Z
history:
  - at: 2026-11-06T23:42:10Z
    field: status
    from: null
    to: New
    by: lead
  - at: 2026-11-06T23:44:11Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-06T23:48:30Z
    field: status
    from: In Progress
    to: In Review
    by: developer
  - at: 2026-11-07T00:07:53Z
    field: status
    from: In Review
    to: In Progress
    by: developer
---

## Description

As a builder, when I open or create a project that isn't set up, I set it up in one pass on one screen and see what was done.

## Acceptance criteria

- [x] An open project that isn't set up (no git, or no `.featra/`) shows a full setup page in Work instead of the list. "Skip" goes to the empty Work list, and "Set up project" can reopen the page from Project settings (test: packages/client/test/components/setup.test.tsx AC1, apps/desktop/e2e/setup.spec.ts)
- [x] One screen offers: Git (always on, required; reads "Already a git repository" when true); the Featra folder (`.featra/` with config, always on, required); each knowledge file as its own checkbox (`CONTEXT.md`, `decisions.md`, `open-questions.md`, `docs/adr/`), with files that already exist shown as "Kept" and disabled; a starter `.gitignore`, offered only when the project has none; and the project's Workflow settings inline, reusing the existing Settings components and storage (test: packages/client/test/components/setup-page.test.tsx AC2, packages/client/test/setup-page.test.ts, packages/server/test/project-setup-plan.test.ts AC2, apps/desktop/e2e/setup.spec.ts)
- [x] One "Set up" action does everything in the right order (git init first) through the server. The user never sees separate git and Featra steps (test: packages/client/test/components/setup-page.test.tsx AC3, packages/server/test/project-setup-plan.test.ts AC3, apps/desktop/test/server-process.test.ts, apps/desktop/e2e/setup.spec.ts)
- [x] Afterwards, a result step lists what was created and what was kept, with a Done button that goes to the Work list. Once the project is set up, the page doesn't come back unless reopened from settings (test: packages/client/test/components/setup.test.tsx AC4, packages/server/test/project-setup-plan.test.ts AC4, apps/desktop/e2e/setup.spec.ts)
- [x] It never overwrites an existing file. It never creates or edits CLAUDE.md or AGENTS.md (test: packages/server/test/project-setup-plan.test.ts AC4/AC5, packages/work-format/test/setup-plan.test.ts AC5, apps/desktop/e2e/setup.spec.ts)

## Tasks

- [x] Card rescoped (title, description, ACs, STORY-33 note)
- [x] work-format: setup item ids, plan shape and params (`setup-plan.ts`); items with a starter `.gitignore` (`setup-items.ts`); `project.setupPlan` and `project.setup` in `ServerMethods`
- [x] Server: `project-setup-plan.ts` (plan, one-pass setup, git first) and the API cases; `writeScaffold` shared with `project.init`
- [x] Client: `ProjectSetupPage` + `useSetupPage` (sections from an array), `SetupResult` as the result step, `useProjectSetup` as the controller, WorkView picks page or list, "Set up project" in Project settings, `ProjectWorkGroups` shared with Project settings, a `Checkbox` control
- [x] Tests: server (real temp git), work-format, client unit and component tests, the e2e rewritten for the page
- [x] Docs: ADR 0015 method table, decisions.md, CONTEXT.md (Project setup), architecture.md

## Notes

- Found when the user tried STORY-2 on a real project: the banner just disappeared and they had to check the folder.
- Rescoped on 2026-11-06: the PM found the setup banner "dumped in" and replaced the banner and confirmation with a
  guided one-screen setup, built in this story. The first cut (a "Featra is set up" confirmation banner) is reused as
  the result step.
- STORY-33 (FEAT-16) will later add sections to this page: role presets, agent instructions, artifacts and acceptance
  proof. The page is built so sections are easy to add.
- The STORY-2 banner tests (`setup.test.tsx`) and the phase-1 confirmation tests (`setup-done.test.tsx`) were
  replaced: the PM removed the banner. STORY-2's behaviour (git, then Featra, never touching agent files) is proved
  again by the page's tests and the e2e. The bridge's `initGit`/`initFeatra` are gone from the client; the server's
  `project.gitInit`/`project.init` remain, unused by the client, so STORY-3's server work isn't disturbed.
- The preload-bundle test caught the first cut pulling the scaffold's YAML into the preload; the light ids and shapes
  now live apart from the items.
- Tests: `pnpm check` passes (448 unit/integration tests). Windows e2e: 31 passed, 2 failed, both in the new
  `setup.spec.ts`, on a test-helper bug (the `row()` locator passed a page-rooted locator to `filter({ has })`, which
  Playwright resolves inside each row, so it never matched). The helper is fixed; the e2e is not yet rerun, per the
  Dev Lead (STORY-3 is verifying first). The card stays In Progress until that rerun passes.
