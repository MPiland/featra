---
id: STORY-15
type: story
title: Feature counts and added scope
status: In Review
parent: FEAT-7
order: 1
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
  - at: 2026-11-13T23:45:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-15
  - at: 2026-11-14T00:37:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-15
---

## Description

As a builder, I read a feature's and an epic's progress at a glance and see what was added after the feature started.
Counts, stage-split bars, epic bars and "+N added" already ship; this story fills the gaps.

## Acceptance criteria

- [x] Hovering or focusing a feature's bar shows its breakdown by stage, for example "1 done · 1 needs your Accept · 2 in progress · 1 not started"; an epic's bar does the same by feature status (test: packages/work-format/test/work-breakdown.test.ts::AC1: a feature's bar says its breakdown by stage; packages/work-format/test/work-breakdown.test.ts::AC1: an epic's bar says its breakdown by feature status; packages/client/test/components/work-breakdown.test.tsx::AC1: a bar shows its breakdown on hover or focus; apps/desktop/e2e/progress-breakdown.spec.ts)
- [x] A feature's scope baseline is set when the feature goes in progress (Start feature), not at approval; stories added between approval and start are planned scope (test: packages/work-format/test/card-approval.test.ts::AC2: the scope baseline is set when the feature goes in progress, not at approval (ADR 0038); packages/work-format/test/rollup.test.ts::scope baseline and added items; packages/work-format/test/rollup.test.ts::burnUp > starts at the scope baseline: empty before the feature goes in progress, then scope from that moment; packages/server/test/feature-start.test.ts::AC1: Start creates the feature's branch and the feature is active on it > the feature is active on the branch, with a status event by user, and main's own commit is untouched; apps/desktop/e2e/progress-breakdown.spec.ts)
- [x] A feature approved before this change keeps working: its baseline is the moment it went in progress, read from its history (test: packages/work-format/test/card-approval.test.ts::AC3: a feature approved before this change keeps working)
- [x] Items added after the baseline show their origin in the feature row's "+N added" breakdown: added stories and bugs counted apart (test: packages/work-format/test/work-breakdown.test.ts::AC4: added items show their origin in the feature row's +N added; packages/client/test/components/work-breakdown.test.tsx::AC4: a feature's Scope says where added items came from; apps/desktop/e2e/progress-breakdown.spec.ts)

## Tasks

- [x] Rules in work-format: the scope baseline is the feature's first move to in progress, read from its history; approval stores no baseline, and a stored approval baseline is ignored (ADR 0038)
- [x] Rules in work-format: the burn-up starts at the baseline
- [x] Rules in work-format: the stage breakdown of a feature's bar, the status breakdown of an epic's bar, and the "+N added" breakdown by stories and bugs, on the Work list rows
- [x] Client: the bar is focusable, named by its breakdown, and shows it as a tooltip on hover or focus; the Scope cell shows the "+N added" breakdown
- [x] Tests: unit and component tests for each criterion, and an e2e journey
- [x] ADR 0038, CONTEXT.md and decisions.md

## Notes
