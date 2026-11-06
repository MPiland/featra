---
id: STORY-41
type: story
title: Every commit passes a lint, format and test gate
status: In Progress
parent: FEAT-13
order: 4
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-06T00:18:58Z
history:
  - at: 2026-11-06T00:18:58Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-06T05:11:03Z
    field: status
    from: New
    to: In Progress
    by: claude
---

## Description

As a builder, I can trust that every commit an agent makes is formatted, linted, type-checked and tested, so the code stays maintainable no matter which session wrote it. Uses OXC (oxlint and oxfmt) per ADR 0014; standards in docs/coding-standards.md.

## Acceptance criteria

- [ ] `pnpm format` and `pnpm format:check` run oxfmt over the whole repo, and the codebase is formatted in one commit
- [ ] `pnpm lint` runs oxlint with TypeScript, React, React Hooks, jsx-a11y and import rules, plus type-aware rules where supported, and passes with zero warnings
- [ ] An import that breaks the package boundaries in ADR 0011 (e.g. work-format importing React, client importing Electron) fails lint
- [ ] A source file over the agreed length cap fails lint; existing files over it are split, not exempted
- [ ] `pnpm check` runs format check, lint, typecheck and unit tests, and a git pre-commit hook runs it in every worktree
- [ ] ADR 0014 lists any OXC rule gaps and how each is covered

## Tasks

- [ ] Break down when picked up

## Notes
