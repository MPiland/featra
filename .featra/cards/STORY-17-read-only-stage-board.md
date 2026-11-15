---
id: STORY-17
type: story
title: Read-only stage board
status: Done
parent: FEAT-7
order: 4
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
  - at: 2026-11-15T10:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-17
  - at: 2026-11-15T16:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-17
  - at: 2026-11-15T14:25:20Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-15T15:52:06Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-15T15:52:06Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a builder, I switch Work to a board of stage columns to spot where stories pile up.

## Acceptance criteria

- [x] A List and Board toggle in Work's header switches to the board; the choice is remembered per project (test: packages/client/test/components/stage-board.test.tsx::AC1: a List and Board toggle in Work's header switches to the board, remembered per project; packages/client/test/work-layout.test.ts; apps/desktop/test/ui-state-board.test.ts; apps/desktop/e2e/stage-board.spec.ts)
- [x] The board has one column per stage, New through Done, in the project's stage order, each with its count (test: packages/client/test/components/stage-board.test.tsx::AC2: one column per stage, New through Done, in the project's stage order, each with its count; packages/work-format/test/stage-board.test.ts::AC2: one column per stage, New through Done, in the project's stage order, each with its count; apps/desktop/e2e/stage-board.spec.ts)
- [x] A filter shows all features' stories or one feature's (test: packages/client/test/components/stage-board.test.tsx::AC3: a filter shows all features' stories or one feature's; packages/work-format/test/stage-board.test.ts::AC3: all features' stories or one feature's; apps/desktop/e2e/stage-board.spec.ts)
- [x] A story card shows its ID and title, a feature tag when all features are shown, its PR chip and a mark when it waits on the user; clicking it opens its card pane (test: packages/client/test/components/stage-board.test.tsx::AC4: a card shows its ID, title, feature, PR and whether it waits on the user, and opens its card pane; apps/desktop/e2e/stage-board.spec.ts)
- [x] Cards cannot be dragged; stages change only through agents, merges and the card pane (test: packages/client/test/components/stage-board.test.tsx::AC5: cards cannot be dragged; stages change only through agents, merges and the card pane; apps/desktop/e2e/stage-board.spec.ts)

## Tasks

- [x] Rules in work-format: the project's stages on the Work list; a board's columns from the list's story rows, and its feature choices
- [x] Client: List and Board toggle in Work's header, remembered per project in the app's UI state
- [x] Client: the board, one column per stage with its count, scrolling inside Work only
- [x] Client: the feature filter beside the filter chips, and the compact card that opens its card pane
- [x] Tests: unit and component tests for each criterion, a read-only guard, and an e2e journey
- [x] CONTEXT.md and decisions.md

## Notes
