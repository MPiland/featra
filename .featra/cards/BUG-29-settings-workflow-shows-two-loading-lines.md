---
id: BUG-29
type: bug
title: Settings Workflow shows two Loading… lines
status: New
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-17T13:08:40Z
history:
  - at: 2026-11-17T13:08:40Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

In the FEAT-8 Settings screenshot (`feat-8-settings-auto-merge-on`: Workflow, project scope, 1280×800), two
"Loading…" lines sit under the Agents group after the rest of the page has loaded.

They are the Checks section (`ProjectChecks.tsx`, `CHECKS_PAGE_COPY.loading`) and the Pull requests section
(`ProjectPrs.tsx`, `PRS_PAGE_COPY.loading`). Each calls `checks.load(dir)` on its own, so the same server call runs
twice. On the server, `checkSettings.load` (`packages/server/src/check-settings.ts`) scans the project, then waits on
GitHub detection (`detectGithub` and `detectGithubUse`, which run git and gh) and the command proposals from files
before it answers. The rest of the page comes from the workflow config, which answers first, so both sections show
"Loading…" until that detection is done.

A failed call does resolve to a view with an `error`, but nothing bounds the wait: if detection hangs (gh stuck on
auth or the network), both sections stay on "Loading…" for good, with no message.

## Acceptance criteria

- [ ] The Workflow page shows no lingering Loading text once its settings are loaded
- [ ] Any part that fails to load says so, rather than staying on Loading

## Tasks

## Notes

Found in the STORY-62 screenshot review (PR #67, CI run 44064172411).
