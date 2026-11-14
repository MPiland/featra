---
id: STORY-16
type: story
title: Feature burn-up chart
status: In Review
parent: FEAT-7
order: 3
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
  - at: 2026-11-14T02:45:52Z
    field: status
    from: New
    to: In Progress
    by: session:story-16
  - at: 2026-11-14T03:00:24Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-16
---

## Description

As a builder, I see in the feature progress pane how a feature's scope and done work moved over time, so scope creep is
visible.

## Acceptance criteria

- [x] The feature progress pane shows a burn-up with a scope line and a done line, built from the cards' `history[]` (test: packages/work-format/test/burn-up.test.ts::AC1: the burn-up is built from the cards' history, with a scope line and a done line; packages/client/test/components/feature-burn-up.test.tsx::AC1: the pane shows a burn-up with a scope line and a done line; apps/desktop/e2e/feature-burn-up.spec.ts)
- [x] It counts stories, or tasks when the project's progress setting is tasks, matching the feature row's count (test: packages/work-format/test/burn-up.test.ts::AC2: it counts what the feature row counts; packages/client/test/components/feature-burn-up.test.tsx::AC2: it counts what the feature row counts; apps/desktop/e2e/feature-burn-up.spec.ts)
- [x] It starts when the feature went in progress, its baseline, with one point per day and a last point for now; bugs count as added scope (test: packages/work-format/test/burn-up.test.ts::AC3: it starts at the baseline, with one point per local day and a last point for now; packages/client/test/components/feature-burn-up.test.tsx::AC1: the pane shows a burn-up with a scope line and a done line; apps/desktop/e2e/feature-burn-up.spec.ts)
- [x] Changes that were never committed still appear in the chart (test: packages/server/test/burn-up-scan.test.ts; packages/client/test/components/feature-burn-up.test.tsx::AC4: changes that were never committed still appear in the chart; apps/desktop/e2e/feature-burn-up.spec.ts)
- [x] No forecast, trend line or completion date is shown (test: packages/client/test/components/feature-burn-up.test.tsx::AC5: no forecast, trend line or completion date is shown; packages/work-format/test/burn-up.test.ts::AC5 and AC6: what the chart says, and nothing before the feature goes in progress)
- [x] Before the feature goes in progress the pane says the chart starts then, instead of an empty chart (test: packages/client/test/components/feature-burn-up.test.tsx::AC6: before the feature goes in progress the pane says the chart starts then; packages/work-format/test/burn-up.test.ts::AC5 and AC6: what the chart says, and nothing before the feature goes in progress; apps/desktop/e2e/feature-burn-up.spec.ts)

## Tasks

- [x] Rules in work-format: the burn-up counts tasks in tasks mode, replayed from the cards' task edits; the feature row carries its series from the scope baseline
- [x] Rules in work-format: one point per local day plus now, the last point being the feature row's count; the chart's text
- [x] Client: the burn-up chart in the feature progress pane (SVG step lines, legend, hidden table), or the line that says when it starts
- [x] Tests: unit and component tests for each criterion, a no-forecast guard, and an e2e journey
- [x] CONTEXT.md, decisions.md and ADR 0039

## Notes
