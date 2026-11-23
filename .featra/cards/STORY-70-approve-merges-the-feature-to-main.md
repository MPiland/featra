---
id: STORY-70
type: story
title: Approve merges the feature to main
status: In Progress
parent: FEAT-9
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-70-approve-merges
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-23T21:37:21Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, one Approve on the approval screen accepts the feature and merges it to main, and I always see why when I can't.

## Acceptance criteria

- [x] Approve records my Accept on the feature and merges it to main in one click (test: packages/client/test/components/feature-end.test.tsx::AC1, AC5: Approve on the review screen > records the user's Accept and merges in one click, then shows the feature merged and Done; packages/server/test/feature-approve.test.ts::Approve without GitHub (AC1, AC5) > records the Accept and merges with a merge commit at the commits judged, committing nothing first; packages/server/test/feature-approve.test.ts::Approve through the feature's PR (AC1, AC2, AC5) > merges the PR with a merge commit at the commit CI passed on, then main has the feature Done with the Accept; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is on once every story is finished and nothing stops the merge; apps/desktop/e2e/approve-feature.spec.ts::Approve a feature on its review screen: off until CI passes, then one click merges it to main)
- [x] Approve is disabled until every story is Done or Cancelled and the merge is clear; the reason shows beside it, using the existing order (stories, conflicts, behind, no PR, PR closed, remote ahead, base busy, checks) (test: packages/client/test/components/feature-end.test.tsx::AC2: Approve waits, with the reason beside it > is off while a story is unfinished, with that reason first even when the merge is blocked too; packages/client/test/components/feature-end.test.tsx::AC2: Approve waits, with the reason beside it > is off with the merge's reason once the stories are finished; packages/client/test/components/feature-end.test.tsx::AC2: Approve waits, with the reason beside it > waits with a reason before the server's first read of the merge; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > names unfinished stories first, before any reason the merge has; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "conflicts" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "behind" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "no PR" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "PR closed" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "remote ahead" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "base busy" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with "checks running" ahead of every reason after it; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > is off with the checks' own reason when they failed, wait or have no command; packages/work-format/test/approval.test.ts::Approve (AC1, AC2) > waits with a reason before the server's first read of the merge; packages/server/test/feature-approve.test.ts::Approve waits (AC2) > is refused while a story is unfinished, and nothing is recorded or read; packages/server/test/feature-approve.test.ts::Approve waits (AC2) > is off with the checks' reason while they fail at the branch's commit; packages/server/test/feature-approve.test.ts::Approve waits (AC2) > is off when main moved on, and the Dev Lead is told to merge main in; packages/server/test/feature-approve.test.ts::Approve through the feature's PR (AC1, AC2, AC5) > opens the feature's PR once it is finished, before any Accept, so its CI runs first; packages/server/test/feature-approve.test.ts::Approve through the feature's PR (AC1, AC2, AC5) > doesn't open it while a story is unfinished; packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > carries Approve, off with the unfinished items first, and refuses it (STORY-70 AC2); apps/desktop/e2e/approve-feature.spec.ts::Approve a feature on its review screen: off until CI passes, then one click merges it to main)
- [x] The feature card pane's separate Accept and Merge buttons are replaced by a link to the approval screen (test: packages/client/test/components/feature-end.test.tsx::AC3: the feature's card pane > has no Accept or Merge, only Review, its link to the approval screen; packages/client/test/components/feature-end.test.tsx::AC3: the feature's card pane > can't be opened from the feature's row while a story is unfinished)
- [x] If the merge fails after my Accept, the Accept stands, the screen says why, and a "Merge to main" retry appears; when main has moved, the Dev Lead is told to merge main in, as today (test: packages/client/test/components/feature-end.test.tsx::AC4: a merge that fails after the Accept > says why in one sentence; packages/client/test/components/feature-end.test.tsx::AC4: a merge that fails after the Accept > offers Merge to main as the retry once accepted, which merges with no confirmation; packages/client/test/components/feature-end.test.tsx::AC4: a merge that fails after the Accept > keeps the retry off with the merge's reason beside it; packages/server/test/feature-approve.test.ts::a merge that fails after the Accept (AC4) > keeps the Accept and says why; Merge to main is then the retry, once main is merged in; packages/server/test/feature-approve.test.ts::a merge that fails after the Accept (AC4) > keeps the Accept when the checks failed by the click (a screen that hadn't heard yet); packages/server/test/feature-approve.test.ts::Approve through the feature's PR (AC1, AC2, AC5) > keeps the Accept when GitHub refuses the merge, says why, and Merge to main retries; packages/work-format/test/approval.test.ts::Merge to main, the retry after a failed merge (AC4) > is the step once accepted, on when nothing stops the merge; packages/work-format/test/approval.test.ts::Merge to main, the retry after a failed merge (AC4) > is off with the merge's reason, or waits before the first read)
- [x] After the merge, the feature shows Done and the screen shows it merged, with any leftover notes (test: packages/client/test/components/feature-end.test.tsx::AC1, AC5: Approve on the review screen > records the user's Accept and merges in one click, then shows the feature merged and Done; packages/client/test/components/feature-end.test.tsx::AC1, AC5: Approve on the review screen > says what stays to do after the merge; packages/server/test/feature-approve.test.ts::Approve without GitHub (AC1, AC5) > records the Accept and merges with a merge commit at the commits judged, committing nothing first; packages/server/test/feature-approve.test.ts::Approve through the feature's PR (AC1, AC2, AC5) > settles later, with the Accept, when the PR merged but main couldn't take the Done card then; packages/server/test/feature-approve.test.ts::Approve through the feature's PR (AC1, AC2, AC5) > doesn't settle a PR merged on GitHub before the user approved it; packages/work-format/test/approval.test.ts::Merged (AC5) > is the step once the feature merged and is Done, with nothing to press; apps/desktop/e2e/approve-feature.spec.ts::Approve a feature on its review screen: off until CI passes, then one click merges it to main)

## Tasks

- [x] featureApprovalOf and the review's approval, over review.watch
- [x] Server Approve: the Accept in the Done card, the Accept kept when the merge fails, finished features read and their PR opened
- [x] Approve and Merge to main on the review screen; the card pane keeps Review only
- [x] ADR 0037 amended and decisions recorded
- [x] E2E journey and ux screenshots

## Notes

Shaped with the user on 2026-11-23. Approve combines the two clicks ADR 0037 describes; the merge rules themselves don't change (merge commit, at the commits it was judged at, never rebase).

## Depends on

- STORY-69 Review a feature on one screen
