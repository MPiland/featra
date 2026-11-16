---
id: STORY-61
type: story
title: Hold a story back from auto-merge
status: Acceptance
parent: FEAT-8
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-61-hold
pr: https://github.com/MPiland/featra/pull/64
created: 2026-11-16T12:00:00Z
history:
  - at: 2026-11-16T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-16T17:10:52Z
    field: status
    from: New
    to: In Progress
    by: session:story-61
  - at: 2026-11-16T18:03:33Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-61
  - at: 2026-11-16T19:28:12Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

As a builder, I hold one story back from merging on its own, so I can look at it first, and merge it myself when I'm ready.

## Acceptance criteria

- [ ] Hold is a toggle on a story in its card pane and its Work row while auto-merge is on; turning it on or off is recorded in the card's history (test: packages/work-format/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story while auto-merge is on, each turn in its history > holds with a held event by the user, and lets go with one back to null; packages/work-format/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story while auto-merge is on, each turn in its history > is a no-op when the story already is held or let go, and keeps every other field; packages/work-format/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story while auto-merge is on, each turn in its history > survives the card file; packages/work-format/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story while auto-merge is on, each turn in its history > applies to a started story in any stage with a writable owner copy while auto-merge is on; packages/work-format/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story while auto-merge is on, each turn in its history > is refused, both ways, when auto-merge is off, the story is merged or cancelled, or isn't one, or can't be written; packages/server/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story, each turn recorded in its history > writes held by the user in the story's worktree copy, and lets it go the same way; packages/server/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story, each turn recorded in its history > is refused while auto-merge is off for the project, and the row shows no toggle; packages/server/test/story-hold.test.ts::STORY-61 AC1: Hold is a toggle on a story, each turn recorded in its history > goes through the API's story.hold; packages/server/test/story-hold.test.ts::STORY-61 AC1: the toggle shows only while the auto-merge setting in effect is on > leaves Hold out of the row when the app default is off and the project doesn't set it; packages/client/test/components/hold-story.test.tsx::STORY-61 AC1: Hold is a toggle on a story in its Work row and its card pane > holds from the row with no confirmation, and the user's every turn is in the card's history; packages/client/test/components/hold-story.test.tsx::STORY-61 AC1: Hold is a toggle on a story in its Work row and its card pane > toggles from the card pane too, which shows it pressed while held; packages/client/test/components/hold-story.test.tsx::STORY-61 AC1: Hold is a toggle on a story in its Work row and its card pane > isn't offered on a story not started yet, which can't merge; packages/client/test/components/hold-story.test.tsx::STORY-61 AC1: Hold is a toggle on a story in its Work row and its card pane > isn't offered on a merged story; packages/client/test/components/hold-story.test.tsx::STORY-61 AC1: Hold is a toggle on a story in its Work row and its card pane > shows a refusal in one sentence and keeps the toggle; packages/server/test/ws-hold.test.ts::STORY-61 AC1: Hold over the socket, while the auto-merge setting in effect is on > is offered once the app default is turned on and saved, and holds the story by the user; packages/server/test/settings-changes.test.ts::STORY-61 review: a settings save rescans only on a change to the auto-merge setting in effect > does nothing when the save leaves the app default as it was; packages/server/test/settings-changes.test.ts::STORY-61 review: a settings save rescans only on a change to the auto-merge setting in effect > rescans only the projects that follow the app default once it changes, and re-checks auto-merge once; apps/desktop/e2e/hold-story.spec.ts::A held story doesn't merge on its own until Hold is turned off)
- [ ] A held story never merges on its own; Merge still works on it (test: packages/work-format/test/story-hold.test.ts::STORY-61 AC2: a held story never merges on its own, and Merge still takes it > isn't picked by auto-merge though Verified and Proven, while Merge doesn't refuse it; packages/server/test/story-hold.test.ts::STORY-61 AC2: a held story never merges on its own, and Merge still works on it > leaves a held, Verified and Proven story unmerged, which Merge then merges; packages/server/test/story-hold.test.ts::STORY-61 AC2: a held story never merges on its own, and Merge still works on it > doesn't merge a story held while auto-merge was about to look at it; packages/server/test/story-hold.test.ts::STORY-61 AC2: a held story never merges on its own, and Merge still works on it > doesn't merge a story held while its try waits for its turn; packages/server/test/story-hold.test.ts::STORY-61 AC2: a held story never merges on its own, and Merge still works on it > doesn't merge a story held while its merge waits on the card lane; packages/client/test/components/hold-story.test.tsx::STORY-61 AC2: Merge still works on a held story > offers Merge beside Hold on a held, Verified story, and merges it; apps/desktop/e2e/hold-story.spec.ts::A held story doesn't merge on its own until Hold is turned off)
- [ ] Turning Hold off lets a story that is already Verified and Proven merge on its own (test: packages/work-format/test/story-hold.test.ts::STORY-61 AC3: a story let go that is Verified and Proven merges on its own again > is picked once Hold is turned off; packages/server/test/story-hold.test.ts::STORY-61 AC3: turning Hold off lets a Verified and Proven story merge on its own > merges the held story once it is let go, by system; packages/server/test/story-hold.test.ts::STORY-61 AC3: turning Hold off lets a Verified and Proven story merge on its own > merges a story let go after a try that failed at the same commits; apps/desktop/e2e/hold-story.spec.ts::A held story doesn't merge on its own until Hold is turned off)
- [ ] Hold is shown on the story row so a held story is easy to spot (test: packages/work-format/test/story-hold.test.ts::STORY-61 AC4: Hold shows on the story's row and card, so a held story is easy to spot > marks the row held, the toggle off on others, and leaves it out while auto-merge is off; packages/work-format/test/story-hold.test.ts::STORY-61 AC4: Hold shows on the story's row and card, so a held story is easy to spot > leaves it out of the row of a story whose copy can't be written here; packages/work-format/test/story-hold.test.ts::STORY-61 AC4: Hold shows on the story's row and card, so a held story is easy to spot > shows on the card view, and survives the wire; packages/client/test/components/hold-story.test.tsx::STORY-61 AC4: a held story is easy to spot on its row > says Held on the row while held, and not once let go; apps/desktop/e2e/hold-story.spec.ts::A held story doesn't merge on its own until Hold is turned off)

## Tasks

- [x] Rules in work-format: the hold field or history event, and the auto-merge rule honours it
- [x] Server: set and clear Hold at the owner's copy; the observer skips held stories and checks a story again when Hold is cleared
- [x] Client: the Hold toggle in the card pane and Work row, and a held mark on the row
- [x] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; move to In Review

## Notes

Shaped with the user on 2026-11-16.

## Depends on

- STORY-59 Merge a proven story on its own
