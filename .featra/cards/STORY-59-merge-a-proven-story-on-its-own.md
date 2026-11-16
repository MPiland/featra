---
id: STORY-59
type: story
title: Merge a proven story on its own
status: Done
parent: FEAT-8
order: 1
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-59-auto-merge
pr: https://github.com/MPiland/featra/pull/62
created: 2026-11-16T12:00:00Z
history:
  - at: 2026-11-16T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-16T14:57:36Z
    field: status
    from: New
    to: In Progress
    by: session:story-59
  - at: 2026-11-16T15:31:49Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-59
  - at: 2026-11-16T16:26:50Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-16T16:50:44Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-16T16:50:44Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a builder, I let a story merge into its feature branch on its own once it is Verified and Proven, so I don't click Merge for every story. Accept still gates Done, not the merge.

## Acceptance criteria

- [x] With auto-merge on, a story that is Verified and Proven merges into its feature branch the same way Merge does, merged by system, without Accept (test: packages/server/test/auto-merge.test.ts::STORY-59 AC1: with auto-merge on, a Verified and Proven story merges as Merge does > merges into its feature branch with a merge commit, merged by system, without Accept; packages/work-format/test/auto-merge.test.ts::STORY-59 AC1: a Verified and Proven story merges on its own > is one Merge would take, Verified and with every criterion proven, with no Accept needed; packages/work-format/test/auto-merge.test.ts::STORY-59 AC1: a Verified and Proven story merges on its own > is still one in Acceptance, and one already Done; apps/desktop/e2e/auto-merge-story.spec.ts::A Verified and Proven story merges into its feature on its own)
- [x] A story that isn't both Verified and Proven, or that Merge would refuse, doesn't merge on its own and keeps the Merge button (test: packages/server/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > leaves a Verified story that isn't Proven, which Merge still merges; packages/server/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > leaves a Proven story Merge refuses: one not in review yet; packages/server/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > leaves a story proven at a commit before its latest, and merges it once proven at that one; packages/server/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > tries a story head once: refused for work left uncommitted, it waits until its commits change; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one proven at an older commit: CI passes on B with a report missing a criterion proven at A; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one whose proof names no commit, as evidence recorded before STORY-59 does; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one whose feature isn't active: Cancelled, Done, or not found; Merge still takes it; packages/server/test/story-prs-proven.test.ts::reading the report when checks finish (AC2) > marks Proven, by system, each criterion whose linked test passed, merging every job's report; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one that is Verified but not Proven: Merge still takes it; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one with no criteria, which is never Proven; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one that is Proven but not Verified; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one Merge refuses: not in review yet, merged already, not in its own worktree, or not checked out; packages/work-format/test/auto-merge.test.ts::STORY-59 AC2: a story that isn't both Verified and Proven, or that Merge refuses, doesn't > isn't one whose owner copy can't be read: the copy shown may be stale (BUG-24))
- [x] A story is checked when its evidence changes and once when the project opens; stories under one feature merge one at a time (test: packages/server/test/auto-merge.test.ts::STORY-59 AC3: checked on evidence changes and when the project opens, one at a time per feature > merges a story already Verified and Proven when the project opens; packages/server/test/auto-merge.test.ts::STORY-59 AC3: checked on evidence changes and when the project opens, one at a time per feature > merges a story as its evidence makes it Proven; packages/server/test/auto-merge.test.ts::STORY-59 AC3: checked on evidence changes and when the project opens, one at a time per feature > merges two stories of one feature one after the other, never at once; packages/server/test/auto-merge.test.ts::STORY-59 AC3: checked on evidence changes and when the project opens, one at a time per feature > passes over a story whose session is working, and merges it once the session is idle; packages/server/test/auto-merge.test.ts::STORY-59 AC3: checked on evidence changes and when the project opens, one at a time per feature > merges each story once when its project is removed and added back while their merges wait; apps/desktop/e2e/auto-merge-story.spec.ts::A Verified and Proven story merges into its feature on its own)
- [x] Auto-merge is a Workflow setting, on by default, with an app default and a project override; with it off nothing merges on its own (test: packages/work-format/test/auto-merge.test.ts::STORY-59 AC4: auto-merge is a work setting, on by default, with an app default and a project override > is on in Featra's own defaults; packages/work-format/test/auto-merge.test.ts::STORY-59 AC4: auto-merge is a work setting, on by default, with an app default and a project override > is the project's own value first, else the app default; packages/work-format/test/auto-merge.test.ts::STORY-59 AC4: auto-merge is a work setting, on by default, with an app default and a project override > off, nothing merges on its own; packages/server/test/auto-merge-setting.test.ts::STORY-59 AC4: auto-merge is on by default, with an app default and a project override > is on when neither the project nor the app sets it; packages/server/test/auto-merge-setting.test.ts::STORY-59 AC4: auto-merge is on by default, with an app default and a project override > follows the app default when the project doesn't set it; packages/server/test/auto-merge-setting.test.ts::STORY-59 AC4: auto-merge is on by default, with an app default and a project override > is the project's own value over the app default; packages/server/test/auto-merge-setting.test.ts::STORY-59 AC4: auto-merge is on by default, with an app default and a project override > is read each time, so a change in Settings applies to the next check; packages/server/test/auto-merge.test.ts::STORY-59 AC4: with auto-merge off nothing merges on its own > leaves a Verified and Proven story for Merge when the project turns it off, and merges it once it's on; packages/server/test/auto-merge.test.ts::STORY-59 AC4: with auto-merge off nothing merges on its own > leaves it when the app default is off and the project doesn't set it; packages/server/test/auto-merge.test.ts::STORY-59 AC4: with auto-merge off nothing merges on its own > merges it once the app default is turned on and the app's settings are saved; apps/desktop/test/server-process.test.ts::the server child process > tells the server the app's settings were saved, a message it takes (STORY-59); packages/client/test/components/settings/AutoMerge.test.tsx::STORY-59 AC4: the Auto-merge setting > is on by default, under Progress and review right after Require acceptance; packages/client/test/components/settings/AutoMerge.test.tsx::STORY-59 AC4: the Auto-merge setting > turning it off in the project writes `autoMerge: false` to its config and labels it overridden; packages/client/test/components/settings/AutoMerge.test.tsx::STORY-59 AC4: the Auto-merge setting > turning off the app default saves it in the app settings, and a project that doesn't set it follows; apps/desktop/e2e/auto-merge-story.spec.ts::A Verified and Proven story merges into its feature on its own)
- [x] The Dev Lead that started the story gets a notice that it merged (test: packages/server/test/auto-merge.test.ts::STORY-59 AC5: the Dev Lead that started the story hears it merged > gets a merged notice naming the feature branch)

## Tasks

- [x] Rules in work-format: when a story merges on its own (the merge rule plus Proven and the setting), the `autoMerge` default on
- [x] Server: an observer that merges eligible stories through the existing merge, one at a time per feature, on evidence changes and at startup; the effective setting read with app defaults
- [x] Server: a "merged" notice to the Dev Lead that started the story
- [x] Client: the Auto-merge toggle on the Workflow settings pages, next to Require acceptance
- [x] Remove `autoMerge: false` from this repo's .featra/config.yaml
- [x] Unit and integration tests for each criterion; Playwright journey; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; ADR 0034 amended (the user merges, or auto-merge when on); move to In Review

## Notes

Shaped with the user on 2026-11-16: merge on Verified and Proven, not Accept; on by default; the Dev Lead hears about every automatic merge.

## Depends on

- STORY-12 Merge a story into its feature
- STORY-57 Proven from a CI test report
