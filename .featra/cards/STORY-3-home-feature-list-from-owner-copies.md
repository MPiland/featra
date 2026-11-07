---
id: STORY-3
type: story
title: Home feature list from owner copies
status: Done
parent: FEAT-2
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-06T23:42:11.022Z
    field: status
    from: New
    to: In Progress
    by: lead
  - at: 2026-11-07T00:20:42.301Z
    field: status
    from: In Progress
    to: In Review
    by: developer
  - at: 2026-11-07T03:08:31.516Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-07T03:08:31.516Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

As a builder, I open Work and see every feature grouped by epic, with each feature's stories underneath, so I know what remains without asking.

## Acceptance criteria

- [x] Epics are collapsible headers; every feature is a same-level row under its epic, and a feature expands to its story rows (test: packages/client/test/components/work-list.test.tsx AC1, apps/desktop/e2e/work-list.spec.ts)
- [x] Feature rows and story rows share one column grid: Feature/Story, Status/Stage, Progress/Criteria, Tasks, Scope/PR (test: packages/client/test/components/work-list.test.tsx AC2)
- [x] Filter chips narrow the list to All, In progress, Needs review, Backlog or Done (test: packages/client/test/components/work-list.test.tsx AC3, packages/client/test/work-list.test.ts, packages/work-format/test/work-list.test.ts)
- [x] Each card is shown from its owning location only (ADR 0002), across all worktrees and branches (test: packages/server/test/work-scan.test.ts AC4, packages/work-format/test/branch-rules.test.ts, packages/work-format/test/owner-copies.test.ts, apps/desktop/e2e/work-list.spec.ts)
- [x] Editing an owner card file outside the app updates the list within 1 second (test: packages/server/test/ws-work.test.ts AC5, packages/client/test/server-watch.test.ts, packages/client/test/components/work-list.test.tsx AC5, apps/desktop/e2e/work-list.spec.ts)
- [x] An edit to a stale copy is flagged on the card with apply-to-owner or discard actions (test: packages/server/test/copy-actions.test.ts, packages/server/test/ws-work.test.ts AC6, packages/work-format/test/copy-edit.test.ts, packages/client/test/components/work-list.test.tsx AC6, apps/desktop/e2e/work-list.spec.ts)

## Tasks

- [x] Pure rules in work-format: branch ownership (`branch-rules.ts`), owner copies and stale copies (`owner-copies.ts`), the three-way apply (`copy-edit.ts`), the Work list and its counts (`work-list.ts`)
- [x] Protocol: `work.watch`, `work.unwatch`, `work.applyCopy`, `work.discardCopy`, and id-less push frames
- [x] `packages/server`: collect copies from main, feature branches and worktrees through git; the SQLite index in the git common dir, rebuilt when corrupt
- [x] `packages/server`: file watching with a 50 ms settle and serial rescans; pushes per socket; apply and discard through `history.ts`
- [x] Client: `ServerClient.watch` with re-watch after a drop; `FeatraBridge.work`
- [x] Client: the Work list under the setup offer: collapsible epics, expandable features on one grid, filter chips, stale-copy banners with Apply to owner and Discard, and a flag on the card's row
- [x] Tests: work-format units, server integration on real git repos, socket tests, client unit and component tests, e2e journey
- [x] ADR 0016; ADR 0015 method table and consequences; decisions.md, architecture.md and CONTEXT.md

## Notes

Handoff (developer, 2026-11-06):

- Bug found and fixed with a regression test: closing the scanner while a scan was running let the scan reopen the index, which held the file (EBUSY on Windows). `close` now waits for scans in flight (packages/server/test/work-scan.test.ts "close waits for a scan in flight").
- One existing test changed its premise, not its assertions' strength: app.test.tsx "shows a placeholder for each view not built yet" now leaves Work out, as STORY-20 did for Settings, and asserts Work shows the Work list.
- AC6 "flagged on the card": the card's row in the list carries an "Edited elsewhere" flag, and a banner above the list says where it was edited, who owns it, and offers Apply to owner and Discard. The card pane is STORY-4.
- Limits (ADR 0016): a committed edit to a non-owner copy isn't flagged; Apply needs the owner checked out in a worktree.
- The `owners` table in the index is written every scan but nothing reads it yet.
