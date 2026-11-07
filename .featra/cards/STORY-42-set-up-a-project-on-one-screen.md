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

- [ ] An open project that isn't set up (no git, or no `.featra/`) shows a full setup page in Work instead of the list. "Skip" goes to the empty Work list, and "Set up project" can reopen the page from Project settings
- [ ] One screen offers: Git (always on, required; reads "Already a git repository" when true); the Featra folder (`.featra/` with config, always on, required); each knowledge file as its own checkbox (`CONTEXT.md`, `decisions.md`, `open-questions.md`, `docs/adr/`), with files that already exist shown as "Kept" and disabled; a starter `.gitignore`, offered only when the project has none; and the project's Workflow settings inline, reusing the existing Settings components and storage
- [ ] One "Set up" action does everything in the right order (git init first) through the server. The user never sees separate git and Featra steps
- [ ] Afterwards, a result step lists what was created and what was kept, with a Done button that goes to the Work list. Once the project is set up, the page doesn't come back unless reopened from settings
- [ ] It never overwrites an existing file. It never creates or edits CLAUDE.md or AGENTS.md

## Tasks

- [ ] Break down when picked up

## Notes

- Found when the user tried STORY-2 on a real project: the banner just disappeared and they had to check the folder.
- Rescoped on 2026-11-06: the PM found the setup banner "dumped in" and replaced the banner and confirmation with a
  guided one-screen setup, built in this story. The first cut (a "Featra is set up" confirmation banner) is reused as
  the result step.
- STORY-33 (FEAT-16) will later add sections to this page: role presets, agent instructions, artifacts and acceptance
  proof. The page is built so sections are easy to add.
