---
id: STORY-14
type: story
title: Accept a feature and merge it to main
status: Done
parent: FEAT-6
order: 8
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
  - at: 2026-11-12T21:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-14
  - at: 2026-11-13T00:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-14
  - at: 2026-11-13T06:48:24Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-13T13:19:03Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-13T13:19:03Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a builder, a finished feature reaches main only after I Accept it and press Merge to main.

## Acceptance criteria

- [x] Accept on a feature is available once all its stories are Done (test: packages/work-format/test/feature-end.test.ts::Accept on a feature (AC1); packages/work-format/test/feature-end.test.ts::the feature's Work row (AC1); packages/work-format/test/feature-end.test.ts::the card pane's feature end (AC1, AC3) > offers Accept once acceptable, and no Merge to main before Accept; packages/server/test/feature-end-local.test.ts::Accept on a feature (AC1); packages/client/test/components/feature-end.test.tsx::AC1: Accept on a feature; apps/desktop/e2e/merge-feature.spec.ts)
- [x] With the project setting "Open feature PRs automatically" on (the default), accepting opens the feature's PR to main; with it off, the feature shows Create PR; local mode has no PR (test: packages/server/test/feature-end-github.test.ts::the feature's PR (AC2); packages/server/test/feature-end-local.test.ts::local mode (AC2); packages/work-format/test/feature-end.test.ts::the feature's PR on its card (AC2); packages/client/test/components/feature-end.test.tsx::AC2: the feature's PR and checks on its card; packages/client/test/components/settings/ProjectPrs.test.tsx::STORY-14 AC2: Open feature PRs automatically; apps/desktop/e2e/merge-feature.spec.ts)
- [x] Merge to main is enabled only after Accept and once the feature's checks pass; it uses a merge commit, and a merge on GitHub outside Featra is noticed (test: packages/server/test/feature-end-local.test.ts::Merge to main without GitHub (AC3, AC5); packages/server/test/feature-end-github.test.ts::Merge to main through the PR (AC3, AC5); packages/work-format/test/feature-end.test.ts::Merge to main waits (AC3, AC4); packages/work-format/test/feature-end.test.ts::the card pane's feature end (AC1, AC3); packages/client/test/components/feature-end.test.tsx::AC3, AC4: Merge to main; packages/server/test/feature-end-review.test.ts::the branch moving between the checks and the merge (review B1); packages/server/test/feature-end-review.test.ts::a PR merged on GitHub outside Featra (review B2); packages/server/test/feature-end-review.test.ts::main's checkout (review Should-fix 2); packages/server/test/feature-end-review.test.ts::what a failure leaves (review Should-fix 5); apps/desktop/e2e/merge-feature.spec.ts)
- [x] When main has moved on or conflicts, Featra sends it to the Dev Lead to merge main into the feature branch, never rebasing, and Merge to main waits for passing checks (test: packages/server/test/feature-end-local.test.ts::when main moves on (AC4); packages/work-format/test/feature-end.test.ts::Merge to main waits (AC3, AC4) > tells the Dev Lead to merge main in with a merge commit, never a rebase, naming conflicting files; packages/client/test/components/feature-end.test.tsx::AC3, AC4: Merge to main > is off with the reason beside it until the server finds nothing stops it; packages/server/test/feature-end-review.test.ts::the Dev Lead's notice (review Should-fix 4))
- [x] After the merge, all the feature's cards are owned by main and the feature is Done (test: packages/server/test/feature-end-local.test.ts::Merge to main without GitHub (AC3, AC5) > waits for the feature's checks, run at its branch's commit, then merges with a merge commit; packages/server/test/feature-end-github.test.ts::Merge to main through the PR (AC3, AC5) > waits for CI at the branch's commit, then merges the PR with a merge commit and makes the feature Done; packages/work-format/test/feature-end.test.ts::after the merge (AC5); packages/server/test/feature-end-review.test.ts::a PR merged on GitHub outside Featra (review B2) > settles once, says main is ahead of GitHub, and later reads commit nothing more; packages/server/test/feature-end-review.test.ts::main's checkout (review Should-fix 2) > merges with Featra's own uncommitted edit to a card main owns; apps/desktop/e2e/merge-feature.spec.ts)

## Tasks

- [x] Rules in work-format: Accept refusal, Accepted, Done by the merge, why Merge to main waits, the Dev Lead's notice
- [x] Feature cards write their PR; `openFeaturePrs` config and Project settings switch
- [x] Server: Accept (PR first), Create PR, checks at the branch's commit (local worktree or CI), facts read on the PR interval and focus
- [x] Server: Merge to main by merge commit (local and GitHub), outside merges, main owning the cards
- [x] Server: the Dev Lead told once per main commit when main moves on or conflicts
- [x] Socket methods feature.accept, feature.createPr, feature.rerunChecks, feature.merge
- [x] Card pane: Accept, Merge to main with its reason; the feature's PR and checks; Open on the feature row
- [x] Tests: work-format, server (local and GitHub), client, e2e
- [x] ADR 0037 and decisions.md

## Notes

Design in ADR 0037; build choices in decisions.md (2026-11-12, STORY-14), and the review rulings applied after them.

## Depends on

- STORY-12 Merge a story into its feature
- STORY-23 Accept or send back a story
