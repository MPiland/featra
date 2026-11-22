---
id: STORY-66
type: story
title: See which projects need you
status: Done
parent: FEAT-20
order: 1
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-66-projects-need-you
pr: "78"
created: 2026-11-18T23:30:00Z
history:
  - at: 2026-11-18T23:30:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-19T20:27:58Z
    field: status
    from: New
    to: In Progress
    by: dev
  - at: 2026-11-19T22:33:12Z
    field: status
    from: In Progress
    to: In Review
    by: dev
  - at: 2026-11-19T23:41:32Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-19T23:41:32Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

As a builder with several projects open, I see in the project switcher which projects have agents waiting on me or work to review, so I know where to go next.

## Acceptance criteria

- [x] Each project in the switcher's menu shows how many of its agents are waiting on me: an unanswered question or a tool approval, inline or in the Inbox; several requests from one agent count once (test: packages/work-format/test/project-needs.test.ts::AC1: waitingAgents counts the agents waiting on the user, not their requests > counts an agent waiting on a tool approval, packages/work-format/test/project-needs.test.ts::AC1: waitingAgents counts the agents waiting on the user, not their requests > counts an agent waiting on an answer to its question, packages/work-format/test/project-needs.test.ts::AC1: waitingAgents counts the agents waiting on the user, not their requests > counts an agent with several requests open once, packages/work-format/test/project-needs.test.ts::AC1: waitingAgents counts the agents waiting on the user, not their requests > counts nothing when no request is open, as after a finished turn, packages/server/test/project-needs.test.ts::AC1: each project counts its agents waiting on the user > counts an agent as soon as it asks for an approval, before the Inbox wait, in its own project only, packages/server/test/project-needs.test.ts::AC1: each project counts its agents waiting on the user > counts an agent waiting on an answer to its question, packages/server/test/project-needs.test.ts::AC1: each project counts its agents waiting on the user > counts an agent with two requests open once, and each agent with one, packages/server/test/project-needs.test.ts::AC1: each project counts its agents waiting on the user > doesn't count an agent whose turn has finished, packages/client/test/components/project-needs.test.tsx::AC1: each project in the menu shows how many of its agents wait on the user > shows each project's count, one for one agent and the number for more, and none when nothing waits, packages/client/test/project-menu.test.ts::STORY-66 AC1, AC2, AC5: each project's marks in the menu > gives a project its waiting count, its quieter review mark after it, both, or none, apps/desktop/e2e/projects-need-you.spec.ts::another project's waiting agent and draft to review show on the switcher and in its menu, live, until answered)
- [x] A project with a draft feature to review or a story at Acceptance shows a quieter review mark beside its name, separate from the count (test: packages/work-format/test/project-needs.test.ts::AC2: hasReview marks a draft feature to review or a story at Acceptance > marks a draft feature an agent drafted for the user, packages/work-format/test/project-needs.test.ts::AC2: hasReview marks a draft feature to review or a story at Acceptance > doesn't mark a draft the user wrote, nor one already approved, packages/work-format/test/project-needs.test.ts::AC2: hasReview marks a draft feature to review or a story at Acceptance > marks a story waiting at Acceptance, packages/work-format/test/project-needs.test.ts::AC2: hasReview marks a draft feature to review or a story at Acceptance > doesn't mark a story the user has accepted, nor one still in review, packages/server/test/project-needs.test.ts::AC2: a project with a draft feature or a story at Acceptance has a review mark > marks a project with a draft feature an agent made for the user, packages/server/test/project-needs.test.ts::AC2: a project with a draft feature or a story at Acceptance has a review mark > marks a project with a story waiting at Acceptance, apart from its count, packages/server/test/project-needs.test.ts::AC2: a project with a draft feature or a story at Acceptance has a review mark > reads a story's owner copy: at Acceptance in its worktree, though main still has it In Progress, packages/server/test/project-needs.test.ts::AC2: a project with a draft feature or a story at Acceptance has a review mark > reads a story's owner copy: accepted in its worktree, though main still has it waiting at Acceptance, packages/client/test/components/project-needs.test.tsx::AC2: a project with work to review shows a quieter review mark beside its name, apart from the count > shows the review mark alone, and after the count when the project has both, packages/client/test/project-menu.test.ts::STORY-66 AC1, AC2, AC5: each project's marks in the menu > gives a project its waiting count, its quieter review mark after it, both, or none, apps/desktop/e2e/projects-need-you.spec.ts::another project's waiting agent and draft to review show on the switcher and in its menu, live, until answered)
- [x] The closed switcher shows a dot when another project has waiting agents or reviews, and none for the current project's own (test: packages/work-format/test/project-needs.test.ts::AC3: othersNeedingYou counts the other projects the closed switcher's dot is for > shows for another project's waiting agents or reviews, packages/work-format/test/project-needs.test.ts::AC3: othersNeedingYou counts the other projects the closed switcher's dot is for > doesn't show for the current project's own, packages/client/test/components/project-needs.test.tsx::AC3: the closed switcher shows a dot when another project needs the user, not for its own > shows no dot for the current project's own waiting agents and reviews, packages/client/test/components/project-needs.test.tsx::AC3: the closed switcher shows a dot when another project needs the user, not for its own > shows the dot with no current project when any open project needs the user: every one is another, packages/client/test/components/project-needs.test.tsx::AC3: the closed switcher shows a dot when another project needs the user, not for its own > shows the dot for another project's waiting agent, and for another's review, apps/desktop/e2e/projects-need-you.spec.ts::another project's waiting agent and draft to review show on the switcher and in its menu, live, until answered)
- [x] Counts, marks and the dot update live as requests arrive and are answered, in every project, without reopening the menu (test: packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > clears an agent's count when its request is answered, packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > marks and clears a review as a card file changes on disk, packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > adds a project opened since and drops one closed, packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > counts a request whose chat names its folder in another case as its project's, packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > clears an agent's count when its session crashes with a request open, packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > clears an agent's count when the user stops its turn with a request open, packages/server/test/project-needs.test.ts::AC4: the needs change live as requests come and go and cards change, in every project > drops a project closed while its agent waits, with its count, packages/server/test/project-needs.test.ts::the needs answer at once and recover, whatever each project's scan does > answers with the waiting counts at once, before any scan, and adds the review when its scan lands, packages/server/test/project-needs.test.ts::the needs answer at once and recover, whatever each project's scan does > counts another project's waiting agents while one project's scan never answers, packages/server/test/project-needs.test.ts::the needs answer at once and recover, whatever each project's scan does > tries a project whose first watch failed again at the next change of the project list, packages/server/test/project-needs.test.ts::the needs answer at once and recover, whatever each project's scan does > answers a second watch, as after a reconnect, from the scans it has, with no new ones, packages/server/test/ws-needs.test.ts::STORY-66: needs.watch > answers every open project's needs, pushes each change, and stops at work.unwatch, packages/client/test/components/project-needs.test.tsx::AC4: counts, marks and the dot change live, without reopening the menu > updates the open menu and the dot as requests arrive and are answered in any project, apps/desktop/e2e/projects-need-you.spec.ts::another project's waiting agent and draft to review show on the switcher and in its menu, live, until answered)
- [x] A screen reader hears each project's name with its count and review mark, and the dot's meaning on the closed switcher (test: packages/client/test/components/project-needs.test.tsx::AC5: a screen reader hears each project's count and review mark, and the dot's meaning > names each menu item with its project, count and mark, and the switcher with what the dot means, packages/client/test/components/project-needs.test.tsx::AC5: a screen reader hears each project's count and review mark, and the dot's meaning > names each item in one piece, so no layout of its marks can split the name (CI: Chromium heard a space before the comma), packages/client/test/project-menu.test.ts::STORY-66 AC1, AC2, AC5: each project's marks in the menu > gives a project its waiting count, its quieter review mark after it, both, or none, apps/desktop/e2e/projects-need-you.spec.ts::another project's waiting agent and draft to review show on the switcher and in its menu, live, until answered)

## Tasks

- [x] Rules: what counts as a waiting agent and a review, as pure functions in `work-format` or the server, unit-tested per kind
- [x] Server: per-project counts pushed to the client for every open project
- [x] Client: the switcher's dot and the menu's counts and marks, with short sentence-case labels
- [x] Unit and integration tests for each criterion; one journey across two projects; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; move to In Review

## Notes

## Depends on

- STORY-7 Inbox and notifications
- STORY-45 Inline tool approvals
