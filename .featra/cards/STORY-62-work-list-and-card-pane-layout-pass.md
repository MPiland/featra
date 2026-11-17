---
id: STORY-62
type: story
title: Work list and card pane layout pass
status: In Progress
parent: FEAT-8
order: 4
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-62-layout
pr: 67
created: 2026-11-17T02:43:35Z
history:
  - at: 2026-11-17T02:43:35Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-17T02:43:35Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, I can read the Work list and a story's card at a normal laptop size without wrapped, clipped or crowded content.

## Acceptance criteria

- [ ] At 1280×800 with the card pane open, no Work list cell wraps or clips, and the shown columns fit (test: apps/desktop/e2e/work-layout.spec.ts::At 1280×800 the Work list and a story's card fit their rows, with fewer columns while the pane is open; packages/client/test/work-columns.test.ts::the Work list's columns > drops Progress too when the list beside the open pane can't fit it, as at 1280 x 800; packages/client/test/work-columns.test.ts::the Work list's columns > never needs more width than the list has, at any window width)
- [ ] With the pane open, the list hides the less important columns, and they come back when it closes; feature and story rows still share one grid (test: packages/client/test/work-columns.test.ts::the Work list's columns > hides Tasks and Scope with the pane open, and brings them back when it closes; packages/client/test/work-columns.test.ts::the Work list's columns > drops what doesn't fit, least important first: Tasks, then Scope, then Progress; packages/client/test/work-columns.test.ts::the Work list's columns > builds one template for feature and story rows: caret, name, Status, then the columns shown; packages/client/test/components/work-columns.test.tsx::the Work list's columns with the card pane (STORY-62 AC2) > hides Tasks and Scope while the pane is open, and brings them back when it closes; packages/client/test/components/work-columns.test.tsx::the Work list's columns with the card pane (STORY-62 AC2) > keeps feature and story rows on the one grid the list sets; apps/desktop/e2e/work-layout.spec.ts::At 1280×800 the Work list and a story's card fit their rows, with fewer columns while the pane is open)
- [ ] Story row metadata and actions sit on one line, aligned with the grid (test: packages/client/test/components/work-columns.test.tsx::a story's line of marks (STORY-62 AC3) > sits under the title, in the name cell, apart from it; packages/client/test/components/work-columns.test.tsx::a story's line of marks (STORY-62 AC3) > holds its PR while the PR column is hidden, and gives it back to the column after; apps/desktop/e2e/work-layout.spec.ts::At 1280×800 the Work list and a story's card fit their rows, with fewer columns while the pane is open)
- [ ] Filters and the "New bug" action sit on one aligned toolbar row (test: apps/desktop/e2e/work-layout.spec.ts::At 1280×800 the Work list and a story's card fit their rows, with fewer columns while the pane is open)
- [ ] In the card pane, the status and parent controls, the evidence marks and the actions each fit their row, with consistent sizes and spacing (test: apps/desktop/e2e/work-layout.spec.ts::At 1280×800 the Work list and a story's card fit their rows, with fewer columns while the pane is open)

## Tasks

- [x] Column rule (work-columns.ts): fewer columns with the pane open, and only those that fit
- [x] Work list: one grid template for every row, cells that never wrap, the story's line of marks, the toolbar
- [x] Card pane: property rows with compact dropdowns, evidence on one line, one size for action buttons
- [x] Unit, component and e2e tests; review screenshots at 1280×800
- [x] Decisions recorded for the Dev Lead

## Notes

Added by the Dev Lead before FEAT-8's Acceptance, on the user's ruling: 1280×800 is the size everything must look right at, and with the pane open the list shows fewer columns.