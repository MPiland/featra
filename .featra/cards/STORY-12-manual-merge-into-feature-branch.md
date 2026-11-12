---
id: STORY-12
type: story
title: Merge a story into its feature
status: Acceptance
parent: FEAT-6
order: 5
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
  - at: 2026-11-12T23:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-12
  - at: 2026-11-12T23:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-12
  - at: 2026-11-12T23:50:15Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

As a builder, I merge a Verified story into its feature branch from Featra, or approve the Dev Lead's request to. Accept gates Done, not the merge.

## Acceptance criteria

- [x] A Verified story shows Merge in its card pane and Work row; merging needs Verified, not Accept (test: packages/client/test/components/merge-story.test.tsx::AC1: Merge on a Verified story > is in its Work row, its card pane and its session, before the story is accepted; packages/client/test/components/merge-story.test.tsx::AC1: Merge on a Verified story > is beside Accept for a Verified story in Acceptance; packages/client/test/components/merge-story.test.tsx::AC1: Merge on a Verified story > is not offered on a story that isn't Verified, or isn't in review; packages/server/test/story-merge.test.ts::a local merge (AC2) > merges a Verified story that isn't accepted yet: Merge needs Verified, not Accept (AC1); packages/server/test/story-merge.test.ts::refusals (design rules) > refuses a story that isn't Verified, or isn't in review yet; packages/server/test/story-merge.test.ts::refusals (design rules) > needs Verified for the branch's current head: checks that settled on another commit, or still run, refuse; packages/server/test/story-checks-head.test.ts; packages/work-format/test/merge.test.ts; packages/server/test/story-merge-local.test.ts::after a restart (review fix) > refuses a commit made since the checks passed: Featra never checked it; packages/server/test/story-merge-local.test.ts::after a restart (review fix) > merges the commit the card says the checks passed, a Done story too; packages/server/test/story-merge-github.test.ts::the head GitHub merges, with checks on CI (review fix) > refuses a commit pushed since CI passed, before the poller reads it, then merges once CI passes it; apps/desktop/e2e/merge-story.spec.ts)
- [x] Merge uses a merge commit: through the PR on GitHub, or a git merge into the feature branch in local mode; a PR merged on GitHub outside Featra is noticed and handled the same way (test: packages/server/test/story-merge.test.ts::a local merge (AC2) > makes a merge commit of the story's branch into its feature, with the card merged by system; packages/server/test/story-merge.test.ts::a local merge (AC2) > leaves the status as it was: Verified and in review, or Done; packages/server/test/story-merge-github.test.ts::a merge through the PR (AC2) > merges the PR with a merge commit at the head it checked, then settles the story; packages/server/test/story-merge-github.test.ts::a merge through the PR (AC2) > refuses a head GitHub doesn't have: a commit not pushed yet merges nothing; packages/server/test/story-merge-github.test.ts::a PR merged on GitHub outside Featra (AC2) > is noticed by the PR poller and settles the same way; packages/server/test/story-merge-local.test.ts::the merge commit (review fixes) > has the card's uncommitted edits; packages/server/test/story-merge-local.test.ts::the merge commit (review fixes) > fast-forwards a checkout that has the feature branch, so its files follow; packages/server/test/story-merge-local.test.ts::the merge commit (review fixes) > isn't published onto a checkout with local changes in the way: nothing changes; packages/server/test/story-merge-local.test.ts::the merge commit (review fixes) > isn't published onto a feature branch that moved since it was read: nothing changes; packages/server/test/story-merge-local.test.ts::the merge commit (review fixes) > needs git 2.38 or later, and says so; packages/server/test/story-merge-github.test.ts::the card's commit on the feature branch (review fixes) > has the card's uncommitted edits; packages/server/test/story-merge-github.test.ts::the card's commit on the feature branch (review fixes) > merges a local feature branch that has commits GitHub doesn't, and says how far ahead it is; packages/server/test/story-merge-github.test.ts::GitHub refusing the merge for another reason (review fix) > is an error, not a conflict: the story stays where it is and its session is told nothing; packages/server/test/story-merge-github.test.ts::a local feature branch git can't count (review fix) > merges without guessing how far ahead it is; packages/client/test/components/merge-story.test.tsx::Merging (AC2, AC5) > merges with no confirmation; the row then says Merged and offers neither Merge nor Resume; apps/desktop/e2e/merge-story.spec.ts)
- [x] The Dev Lead can ask to merge with `request_merge`; the user sees a card to approve or decline, and approving merges (test: packages/server/test/merge-request.test.ts::request_merge (AC3) > puts an approval card in front of the user in the Dev Lead's chat, and approving merges; packages/server/test/merge-request.test.ts::request_merge (AC3) > merges nothing when the user declines, and tells the Dev Lead; packages/server/test/merge-request.test.ts::request_merge (AC3) > tells the Dev Lead why a merge it was allowed didn't happen; packages/server/test/merge-request.test.ts::request_merge (AC3) > refuses a chat that didn't start the story, a story that can't merge, and a second ask while one waits; packages/server/test/merge-request.test.ts::an ask whose Dev Lead chat ends (review fix) > ends unanswered, so the next ask isn't refused as waiting, and merges nothing; packages/server/test/merge-request.test.ts::story.requestMerge on the agent bridge > is refused to a story session: a story's work is reviewed, not merged on its own word; packages/mcp/test/request-merge.test.ts; packages/client/test/components/merge-story.test.tsx::AC3: the Dev Lead's request_merge card > asks the user to merge the story into its feature, with Merge and Decline only; packages/client/test/components/merge-story.test.tsx::AC3: the Dev Lead's request_merge card > approves with Merge and declines with Decline)
- [x] On a conflict nothing is merged; the story returns to In Progress and its session gets the conflicting files (test: packages/server/test/story-merge.test.ts::a conflict (AC4) > merges nothing, sends the session the files, then puts the story back in In Progress by system; packages/server/test/story-merge.test.ts::a conflict (AC4) > still records the conflict when the session can't be told, and says so in the log; packages/server/test/story-merge-github.test.ts::a conflict on GitHub (AC4) > merges nothing, tells the session the files, and puts the story back in In Progress; packages/server/test/story-merge-github.test.ts::GitHub refusing the merge for another reason (review fix) > is an error when GitHub says it conflicts but git finds no files: nothing moves; packages/client/test/components/merge-story.test.tsx::Merging (AC2, AC5) > shows a refusal or conflict in one sentence and keeps the button (AC4))
- [x] After the merge, card ownership moves to the feature branch, the story's worktree and its local and remote branches are removed, and its chat stays as read-only history (test: packages/server/test/story-merge.test.ts::after the merge (AC5) > removes the worktree and the story's branch, retires its session, and the feature branch owns the card; packages/server/test/story-merge.test.ts::after the merge (AC5) > refuses a second merge: the story is merged; packages/server/test/story-merge-github.test.ts::a merge through the PR (AC2) > merges the PR with a merge commit at the head it checked, then settles the story; packages/server/test/story-merge-github.test.ts::a PR merged on GitHub outside Featra (AC2) > keeps a worktree with uncommitted work, its files intact, and says so (review fix); packages/server/test/story-merge-github.test.ts::the card's commit on the feature branch (review fixes) > changes nothing when the feature branch can't take it, so merging again settles it; packages/server/test/story-merge-local.test.ts::a turn that runs mid-merge (review fix) > can't start: the Dev Lead's message and Resume are refused while the story merges; packages/server/test/story-merge-local.test.ts::a turn that runs mid-merge (review fix) > can't start: the user's message in the story's chat and Send back are refused too; packages/server/test/story-merge-local.test.ts::a turn that runs mid-merge (review fix) > left uncommitted work: the worktree and its branch stay, files intact, and the user is told; packages/server/test/story-merge-local.test.ts::what goes after a local merge (review fixes) > deletes the story's branch on a remote that has it; packages/server/test/story-merge-local.test.ts::what goes after a local merge (review fixes) > keeps a remote branch with commits the feature doesn't have, and says so; packages/server/test/story-merge-local.test.ts::what goes after a local merge (review fixes) > says the remote branch is still there when its remote can't be reached; packages/server/test/story-merge-local.test.ts::what goes after a local merge (review fixes) > removes a worktree that Windows still holds for a moment; packages/client/test/components/merge-story.test.tsx::Merging (AC2, AC5) > says what a merge left behind in place of the button; apps/desktop/e2e/merge-story.spec.ts)

## Tasks

- [x] Rules in work-format: when a story can merge (Verified, a live worktree, not merged), the `merged` history event, `story.merge` and `story.requestMerge` methods
- [x] Server: local merge into the feature branch as a merge commit (merge-tree, no checkout touched), GitHub merge through `gh pr merge --merge --match-head-commit`, refusing a stale head or uncommitted work
- [x] Server: after the merge, stop the session, record `merged` on the feature branch, remove the worktree and the local and remote branches; the PR poller does the same for a PR merged outside Featra
- [x] Server: a conflict merges nothing, returns the story to In Progress and sends its session the conflicting files
- [x] MCP `request_merge` for the Dev Lead: an approval card in its chat and the Inbox; approving merges, and the outcome goes back as a notice
- [x] Client: Merge in the card pane and Work row; Merge and Decline on the request card; no Stop or Resume once merged
- [x] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; ADR 0034; move to In Review

## Notes

## Depends on

- STORY-11 Story PR and PR chip
- STORY-56 Local checks and where checks run
