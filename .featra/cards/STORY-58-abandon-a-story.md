---
id: STORY-58
type: story
title: Abandon a story
status: In Review
parent: FEAT-6
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-58-abandon
pr: null
created: 2026-11-11T20:00:00Z
history:
  - at: 2026-11-11T20:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-12T18:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-58
  - at: 2026-11-12T19:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-58
---

## Description

As a builder, I abandon a story I no longer want, keeping its card as Cancelled or discarding it.

## Acceptance criteria

- [x] Abandon warns when the story's worktree has uncommitted or unpushed work and asks to confirm (test: packages/server/test/story-abandon.test.ts::the warning (AC1) > names uncommitted files, commits not pushed, the PR it closes, the branch and the remote; packages/server/test/story-abandon.test.ts::the warning (AC1) > warns of nothing but the worktree and branch when nothing would be lost; packages/server/test/story-abandon.test.ts::the warning (AC1) > refuses to go ahead once something new would be lost, and changes nothing; packages/server/test/story-abandon.test.ts::the warning (AC1) > refuses a done story; packages/work-format/test/abandon.test.ts::the warning (AC1) > names uncommitted files, commits not pushed and the PR it closes, capped, before what always goes; packages/work-format/test/abandon.test.ts::the warning (AC1) > is a plain question when nothing would be lost; packages/client/test/components/abandon-story.test.tsx::the warning (AC1) > names what would be lost and asks to confirm, focus on Cancel; packages/client/test/components/abandon-story.test.tsx::the warning (AC1) > is a plain question when nothing would be lost; Escape closes it, focus back on Abandon; apps/desktop/e2e/abandon-story.spec.ts)
- [x] The user chooses to keep the card as Cancelled (logged in history, left out of counts) or to discard it (test: packages/server/test/story-abandon.test.ts::abandoning with GitHub usable (AC2, AC3) > keeps the card as Cancelled on the feature branch, closes the PR, removes the worktree and branches; packages/server/test/story-abandon.test.ts::discarding the card (AC2) > deletes it on the feature branch and from the index; main's older copy doesn't bring it back; packages/server/test/story-abandon.test.ts::a story with no worktree (AC2) > is kept as Cancelled where its owner has it, with nothing else to remove; packages/server/test/story-abandon.test.ts::a story with no worktree (AC2) > is discarded where its owner has it, and stays gone; packages/work-format/test/abandon.test.ts::the card kept as Cancelled (AC2) > is Cancelled, logged in its history by the user, and survives a round trip; packages/work-format/test/abandon.test.ts::an abandoned story is left out of counts (AC2) > leaves feature progress and scope; packages/work-format/test/abandon.test.ts::an abandoned story is left out of counts (AC2) > leaves the burn-up's scope from the moment it was abandoned; packages/work-format/test/abandon.test.ts::an abandoned story is left out of counts (AC2) > leaves the board's counts and bar, and still shows as a Cancelled row; packages/work-format/test/owner-copies.test.ts; packages/client/test/components/abandon-story.test.tsx::the choice (AC2) > keeps the card as Cancelled with the warning's token, and says what stayed; packages/client/test/components/abandon-story.test.tsx::the choice (AC2) > discards the card and closes its pane; apps/desktop/e2e/abandon-story.spec.ts)
- [x] Abandoning stops the story's session, closes its open PR, and removes its worktree and its local and remote branches (test: packages/server/test/story-abandon.test.ts::abandoning with GitHub usable (AC2, AC3) > keeps the card as Cancelled on the feature branch, closes the PR, removes the worktree and branches; packages/server/test/story-abandon.test.ts::abandoning with GitHub usable (AC2, AC3) > stops a running turn before it retires the session; packages/server/test/story-abandon.test.ts::abandoning with GitHub usable (AC2, AC3) > leaves the story as it was when the PR can't be closed; packages/server/test/story-abandon.test.ts::abandoning with GitHub usable (AC2, AC3) > leaves a remote branch with commits that aren't here, and says so; packages/server/test/story-abandon.test.ts::discarding the card (AC2) > deletes it on the feature branch and from the index; main's older copy doesn't bring it back; packages/server/test/story-abandon.test.ts::one ending at a time (AC3) > refuses the session's messages and a second Abandon while one runs; packages/server/test/story-ending.test.ts; packages/client/test/components/abandon-story.test.tsx::the choice (AC2) > shows what couldn't be removed after keeping it; packages/client/test/components/abandon-story.test.tsx::the choice (AC2) > says why it was refused, and puts focus back on Abandon; apps/desktop/e2e/abandon-story.spec.ts)

## Tasks

- [x] Abandon rules in work-format: which stories can be abandoned, the warning's wording, the Cancelled card
- [x] One gate for a story that is ending (merge or abandon): messages, Send back and Resume are refused meanwhile
- [x] The warning: uncommitted files, commits not on any remote, the open PR, as a fingerprint the confirm must match
- [x] Teardown shared with the merge: stop and retire the session, close the PR, remove the worktree and branches
- [x] Keep as Cancelled (committed on the feature branch) or discard (deletion committed on the feature branch)
- [x] A card its owner deleted is gone, not shown from an older copy elsewhere
- [x] Abandon in the card pane, with the inline confirm shared with draft Reject
- [x] Unit, integration and e2e tests; link each AC
- [x] Record build choices in decisions.md

## Notes
