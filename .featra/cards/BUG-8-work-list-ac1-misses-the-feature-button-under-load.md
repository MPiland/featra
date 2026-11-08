---
id: BUG-8
type: bug
title: Work list AC1 misses the feature button under load
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
created: 2026-11-08T22:52:19Z
history:
  - at: 2026-11-08T22:52:19Z
    field: status
    from: null
    to: New
    by: session:bug-6
---

## Description

`packages/client/test/components/work-list.test.tsx` "AC1: epics fold their features; a feature opens to its stories > opens a feature to its stories, rows of the same table" failed 2 times during BUG-6's work on Windows, each time in a full `pnpm test:unit` run: once in the handle-tracing loop (run 15) and once in the soak at d28ed25 (run 43 of 50). Both times it failed the same way:

```
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Cards and the feature list"
 ❯ toggle test/components/work-list.test.tsx:11:41
      11| const toggle = (name: string) => screen.getByRole("button", { name });
 ❯ test/components/work-list.test.tsx:54:21
```

The test waits for the "Work list" region with `findByRole`, then looks for the feature's button with `getByRole`, which doesn't wait. The DOM it printed had the title bar but not the feature row. One thing to check: whether the region can render before its rows. Then `getByRole` runs too early when the run is under load. This test runs no server code.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] The test passes 50 full `pnpm test:unit` runs in a row on Windows, with its assertions unchanged.

## Tasks

- [ ] Find what renders between the region and the feature rows
- [ ] Fix the cause without weakening the test

## Notes

- Found by BUG-6. Full output of the soak failure: run 43 at d28ed25.
