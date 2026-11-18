---
id: STORY-60
type: story
title: An automatic merge that fails
status: Done
parent: FEAT-8
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-60-auto-merge-fails
pr: https://github.com/MPiland/featra/pull/63
created: 2026-11-16T12:00:00Z
history:
  - at: 2026-11-16T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-16T17:10:47Z
    field: status
    from: New
    to: In Progress
    by: session:story-60
  - at: 2026-11-16T17:49:34Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-60
  - at: 2026-11-16T19:14:18Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-16T19:46:54Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-16T19:46:54Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a builder, when a story can't merge on its own, I see why on the story, and the Dev Lead hears about it without me relaying it.

## Acceptance criteria

- [x] On a conflict nothing merges; the story returns to In Progress and its session gets the conflicting files, as with Merge (test: packages/server/test/auto-merge-fails.test.ts::STORY-60 AC1: on a conflict nothing merges, and the story goes back with its files > leaves the feature branch, moves the story to In Progress and sends its session the files, as Merge does; packages/server/test/auto-merge-races.test.ts::STORY-60 review: a conflict stands while the story's commit and the feature's tip stay > tries once more and merges when the feature branch's conflicting change is reverted; packages/work-format/test/not-merged.test.ts::STORY-60: the not-merged record > names the feature branch's tip too for a conflict, and stands or goes by the commit tried as any other)
- [x] The Dev Lead that started the story gets a "not merged" notice with the reason, for a conflict or any other refusal (test: packages/server/test/auto-merge-fails.test.ts::STORY-60 AC2: the Dev Lead that started the story hears it didn't merge, and why > gets a not merged notice with the conflict; packages/server/test/auto-merge-fails.test.ts::STORY-60 AC2: the Dev Lead that started the story hears it didn't merge, and why > gets a not merged notice with GitHub's refusal; packages/server/test/auto-merge-fails.test.ts::STORY-60 AC2: the Dev Lead that started the story hears it didn't merge, and why > gets a not merged notice for work left uncommitted, which Merge refuses; packages/server/test/auto-merge-fails.test.ts::STORY-60 AC2: the Dev Lead that started the story hears it didn't merge, and why > isn't told, and nothing is recorded, when the story's session starts a turn as its merge begins; packages/work-format/test/not-merged.test.ts::STORY-60: the not-merged record > is told to the Dev Lead with the feature branch, as the merged notice is; packages/server/test/auto-merge-races.test.ts::STORY-60 review 1: a refusal that isn't the story's own is neither recorded nor told > merges a story moved back to In Review on the same commit after a move while it was queued behind a sibling; packages/server/test/auto-merge-races.test.ts::STORY-60 review 1: a refusal that isn't the story's own is neither recorded nor told > records and tells nothing when GitHub can't be read, and merges on the next look once it can; packages/server/test/auto-merge-races.test.ts::STORY-60 review 2 and 3: races with Merge by hand > sends no notice when a Merge by hand finishes while the automatic one waits; packages/server/test/auto-merge-races.test.ts::STORY-60 review 2 and 3: races with Merge by hand > sends no notice and records nothing when a Merge by hand is running as the automatic one starts)
- [x] A refusal that isn't a conflict, such as branch protection, leaves the story where it is with the reason on the card, and isn't retried until the story changes (test: packages/server/test/auto-merge-fails.test.ts::STORY-60 AC3: a refusal that isn't a conflict leaves the story, with the reason on its card, untried until it changes > keeps the story in review and records why on its card, by system, at the commit tried; packages/server/test/auto-merge-fails.test.ts::STORY-60 AC3: a refusal that isn't a conflict leaves the story, with the reason on its card, untried until it changes > isn't tried again on rescans, a recheck, a chat change or a restart; packages/server/test/auto-merge-fails.test.ts::STORY-60 AC3: a refusal that isn't a conflict leaves the story, with the reason on its card, untried until it changes > is tried again after a restart once its checks settle on a new commit, and merges; packages/work-format/test/not-merged.test.ts::STORY-60: the not-merged record > is a history event by system, from the commit tried, to why; packages/work-format/test/not-merged.test.ts::STORY-60: the not-merged record > stands when the story moves between stages, and when its checks settle again on the commit tried; packages/work-format/test/not-merged.test.ts::STORY-60: the not-merged record > goes when its checks settle on another commit, or it merges; packages/work-format/test/not-merged.test.ts::STORY-60: the not-merged record > is the latest one when a story fails to merge on its own again; apps/desktop/e2e/auto-merge-fails.spec.ts::A story that can't merge on its own says why on its card and in its session; packages/server/test/auto-merge-races.test.ts::STORY-60 review 1: a refusal that isn't the story's own is neither recorded nor told > merges a story moved back to In Review on the same commit after a move while it was queued behind a sibling; packages/server/test/auto-merge-races.test.ts::STORY-60 review 1: a refusal that isn't the story's own is neither recorded nor told > records and tells nothing when GitHub can't be read, and merges on the next look once it can; packages/server/test/auto-merge-races.test.ts::STORY-60 review: a conflict stands while the story's commit and the feature's tip stay > tries once more and merges when the feature branch's conflicting change is reverted)
- [x] The story's chat and card show that the automatic merge didn't happen and why (test: packages/server/test/auto-merge-fails.test.ts::STORY-60 AC4: the card says the automatic merge didn't happen and why > records a conflict on the card, after the story's move back; packages/work-format/test/not-merged.test.ts::STORY-60 AC4: the card pane and the Work row carry why > is in the card's view, through the socket, while it stands; packages/work-format/test/not-merged.test.ts::STORY-60 AC4: the card pane and the Work row carry why > is on the story's row, through the socket, which its session reads; packages/work-format/test/not-merged.test.ts::STORY-60 AC4: the card pane and the Work row carry why > reads as one short line; packages/client/test/components/not-merged.test.tsx::STORY-60 AC4: the card and the session say the merge on its own didn't happen, and why > shows why in the story's card pane, and keeps Merge for the user; packages/client/test/components/not-merged.test.tsx::STORY-60 AC4: the card and the session say the merge on its own didn't happen, and why > shows why in the story's session; packages/client/test/components/not-merged.test.tsx::STORY-60 AC4: the card and the session say the merge on its own didn't happen, and why > stops showing it once the story's checks settle on another commit; apps/desktop/e2e/auto-merge-fails.spec.ts::A story that can't merge on its own says why on its card and in its session)

## Tasks

- [x] Server: the auto-merge observer handles a conflict through the existing conflict path and records any other refusal once per story head
- [x] Server: a "not merged" notice to the Dev Lead, with the reason
- [x] Client: the reason shown on the card and in the story's chat
- [x] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; move to In Review

## Notes

Shaped with the user on 2026-11-16: the Dev Lead hears about every automatic merge, merged or not.

## Depends on

- STORY-59 Merge a proven story on its own
