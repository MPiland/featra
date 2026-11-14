---
id: STORY-24
type: story
title: Feature progress pane
status: Acceptance
parent: FEAT-7
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-14T01:26:33Z
    field: status
    from: New
    to: In Progress
    by: session:story-24
  - at: 2026-11-14T01:45:32Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-24
  - at: 2026-11-14T02:26:17Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

As a builder, I open a feature's progress pane from its chat or its row in Work and see every story's progress without
asking the Dev Lead.

## Acceptance criteria

- [x] A Feature progress button appears only on chats that coordinate a feature, and opens the pane docked on the right (test: packages/client/test/components/feature-progress.test.tsx::AC1: Feature progress is on a chat that coordinates a feature, and opens docked on the right; packages/work-format/test/feature-progress.test.ts::featuresLedBy; apps/desktop/e2e/feature-progress.spec.ts)
- [x] Opening a feature row in Work shows the same pane, so a feature without a chat has it too (test: packages/client/test/components/feature-progress.test.tsx::AC2: a feature's row in Work opens the same pane; apps/desktop/e2e/feature-progress.spec.ts)
- [x] The pane shows the feature's counts and bar, added scope, open bugs and branch, and each story's stage, criteria, tasks and PR (test: packages/client/test/components/feature-progress.test.tsx::AC3: the pane shows the feature's counts, scope, branch and each story; packages/work-format/test/feature-progress.test.ts::a feature row's branch; apps/desktop/e2e/feature-progress.spec.ts)
- [x] Clicking a story opens its chat, or its card when it has no chat; a story waiting on the user is marked (test: packages/client/test/components/feature-progress.test.tsx::AC4: a story opens its chat, or its card, and a story waiting on the user is marked; packages/work-format/test/feature-progress.test.ts::storyChat; packages/work-format/test/feature-progress.test.ts::waitsOnUser; apps/desktop/e2e/feature-progress.spec.ts)
- [x] The pane updates live from the cards and spends no agent tokens (test: packages/client/test/components/feature-progress.test.tsx::AC5: the pane updates live from the cards and spends no agent tokens; apps/desktop/e2e/feature-progress.spec.ts)

## Tasks

- [x] Rules in work-format: a feature row names its branch; which features a chat leads (it drafted them, or spawned a story session of theirs); whether a story waits on the user
- [x] Client: the feature progress pane, docked on the right with the card pane's handle and width, one right pane at a time
- [x] Client: Feature progress in the header of a chat that leads a feature, and a progress icon on each feature row in Work
- [x] Client: a story opens its chat, or its card with the way back to the progress pane; Card opens the feature's card
- [x] Tests: unit and component tests for each criterion, and an e2e journey
- [x] CONTEXT.md and decisions.md

## Notes
