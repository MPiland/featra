---
id: STORY-42
type: story
title: Init confirms what it created
status: In Review
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
---

## Description

As a builder, when I initialise Featra I see what it created and what it kept, so I don't have to check the folder.

## Acceptance criteria

- [x] After Initialize Featra succeeds, Work shows a short confirmation ("Featra is set up") listing the files it created and any it kept (test: packages/client/test/components/setup-done.test.tsx AC1, apps/desktop/e2e/setup.spec.ts)
- [x] After Initialize Git succeeds, the next step (Initialize Featra) shows without a reload (test: packages/client/test/components/setup-done.test.tsx AC2, packages/client/test/components/setup.test.tsx AC1, apps/desktop/e2e/setup.spec.ts)
- [x] The confirmation can be dismissed and does not come back for that project (test: packages/client/test/components/setup-done.test.tsx AC3, apps/desktop/e2e/setup.spec.ts)

## Tasks

- [x] Client: keep `project.init`'s `{ created, kept }` per project in `useProjectSetup` instead of dropping it
- [x] Client: `SetupDone` banner ("Featra is set up", Created and Kept lists, Dismiss) and its copy in `SETUP_COPY`
- [x] Styles: compact wrapping path lists in `setup.css`
- [x] Tests: component tests for the three ACs (harness can set what init reports), AC2 proved without code change
- [x] E2e: extend the STORY-2 journey with the real server's lists, Dismiss, and a relaunch
- [x] decisions.md: why the dismissal isn't stored

## Notes

- Found when the user tried STORY-2 on a real project: the banner just disappeared and they had to check the folder.
  The server already returns `{ created, kept }` from `project.init`; the client drops it.
- The confirmation replaces the offer in the same spot and is its own region, named by its heading. The offer region
  ("Project setup") is gone after init, so STORY-2's assertions hold unchanged.
- "Does not come back": the confirmation is in-memory client state per project, cleared by Dismiss. Nothing is
  stored, because only an init in this run creates it and a `ready` project is never offered init again
  (decisions.md, STORY-42). The e2e relaunches with the same profile and reopens the project to prove it.
- AC2 already held after STORY-2; it is now proved by its own test (no reload call, the Featra offer follows).
- No server, protocol or `WorkView.tsx` change.
- E2E: Windows 32 passed (setup.spec.ts journey extended). Unit and integration: 415 passed (7 new in
  setup-done.test.tsx). Not checked: the e2e on WSLg (skipped, per the brief).
