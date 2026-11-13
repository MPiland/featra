---
id: STORY-13
type: story
title: File and place bugs
status: In Review
parent: FEAT-6
order: 7
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
  - at: 2026-11-12T20:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-13
  - at: 2026-11-12T23:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-13
---

## Description

As a builder, bugs land in the right place: the Dev Lead proposes the cause, and I confirm where the bug goes.

## Acceptance criteria

- [x] The Dev Lead files a bug with `report_bug` and a suspected cause; the user files one from Work with New bug (test: packages/server/test/report-bug.test.ts::report_bug (AC1, AC3) > asks the user with the proposed place, and Create with another place files it there; packages/server/test/report-bug.test.ts::report_bug (AC1, AC3) > refuses a report without a title, or with a cause that isn't a card; packages/server/test/report-bug.test.ts::New bug in Work (AC1, AC3) > proposes a place for the cause, and files at the place the user confirmed; packages/server/test/report-bug.test.ts::bug.report on the agent bridge > is refused to a story session, which tells the Dev Lead instead; packages/mcp/test/report-bug.test.ts::report_bug through the Featra MCP (AC1) > asks the user with Featra's proposal, in the Inbox, and writes nothing yet; packages/mcp/test/report-bug.test.ts::report_bug through the Featra MCP (AC1) > tells the agent what to fix in one sentence when it is refused; packages/work-format/test/bug-filing.test.ts::parseBugReport > tidies the title and the cause; packages/client/test/components/file-bug.test.tsx::AC1, AC3: the Dev Lead's report_bug card > shows the bug, its suspected cause and Featra's proposed place, with Create and Cancel; packages/client/test/components/file-bug.test.tsx::AC1, AC3: New bug in Work > proposes a place again when the suspected cause changes, and files where the user confirmed; apps/desktop/e2e/file-bug.spec.ts)
- [x] Featra proposes the placement: a bug card under the in-progress feature that caused it (origin `bug`, counted as added scope), a task on a story still being worked, or the project bug list (test: packages/work-format/test/bug-filing.test.ts::bugPlacements > offers a bug under each feature in progress, a task on each story being worked, then the project list; packages/work-format/test/bug-filing.test.ts::fileBug > makes a bug card under the feature in progress, at the first stage, counted as added scope; packages/work-format/test/bug-filing.test.ts::fileBug > writes a card that reads back the same, origin and all; packages/work-format/test/bug-filing.test.ts::fileBug > makes a project bug with no cause line when no cause is known; packages/work-format/test/bug-filing.test.ts::fileBug > adds a task to the story being worked, and records it in the story's history; packages/server/test/bug-filing.test.ts::proposing a place (AC2); packages/server/test/bug-filing.test.ts::filing (AC2, AC3) > commits a bug under the feature in progress on its branch, touching no checkout, as added scope; packages/server/test/bug-filing.test.ts::filing (AC2, AC3) > writes a project bug in main's checkout, and Work lists it on the project bug list; packages/server/test/bug-filing.test.ts::filing (AC2, AC3) > adds a task to the story in its worktree, with a history event; packages/server/test/bug-filing.test.ts::filing (AC2, AC3) > gives each bug an ID no copy has, on any branch; packages/server/test/bug-filing-review.test.ts::a story its feature branch owns, with no worktree (review 2a, ruling 7) > is offered the feature bug, not a task, and a task on it is refused; packages/server/test/bug-filing-review.test.ts::where the owner is or isn't checked out (review 2b, 2c); packages/server/test/bug-filing-review.test.ts::an ID already taken where the bug goes (review 2d); packages/server/test/bug-filing-review.test.ts::a branch that moved after the scan (review 1) > refuses the bug rather than add a second BUG-1 beside one committed meanwhile; packages/server/test/bug-filing-review.test.ts::a task on a story whose worktree has no copy of its card (review 10) > is refused as a card edit would be, and writes nothing; packages/server/test/story-abandon-review.test.ts::a feature branch that moved after the scan (STORY-13 review) > refuses the abandon, and a task edit committed there meanwhile is kept; apps/desktop/e2e/file-bug.spec.ts)
- [x] The user confirms or changes the placement before the bug is created (test: packages/server/test/report-bug.test.ts::report_bug (AC1, AC3) > asks the user with the proposed place, and Create with another place files it there; packages/server/test/report-bug.test.ts::report_bug (AC1, AC3) > refuses a place that wasn't offered, and keeps the card waiting; packages/server/test/bug-filing.test.ts::filing (AC2, AC3) > files the place the user picked over the proposal; packages/server/test/bug-filing.test.ts::filing (AC2, AC3) > refuses a place no longer offered, and a cause that isn't a card, writing nothing; packages/work-format/test/bug-filing.test.ts::the placement crossing to the client > carries the place the user picked on Allow, and only on Allow; packages/client/test/components/file-bug.test.tsx::AC1, AC3: the Dev Lead's report_bug card > creates it where the user placed it, or cancels it; packages/client/test/components/file-bug.test.tsx::AC1, AC3: the Dev Lead's report_bug card > keeps the proposal when the user doesn't change it; packages/client/test/components/file-bug.test.tsx::AC1, AC3: New bug in Work > can't be created without a title, and shows why the server refused, keeping what was typed; packages/client/test/components/file-bug.test.tsx::AC1, AC3: New bug in Work > writes nothing when cancelled; packages/client/test/components/file-bug.test.tsx::New bug's proposal and focus (STORY-13 review); packages/server/test/app-approvals.test.ts::a chosen option (ruling 6); packages/server/test/app-approvals.test.ts::an app request with choices, as the chat manager asks it (rulings 8, 9); packages/server/test/app-approvals.test.ts::report_bug whose chat ends before the user answers (ruling 8) > tells the Dev Lead the bug wasn't filed because the request was cancelled, and writes nothing; packages/work-format/test/app-request-subject.test.ts::an app request's subject (ruling 9); apps/desktop/e2e/file-bug.spec.ts)
- [x] Bug cards show a bug icon, Work has a project bug list, and a Done feature stays Done (test: packages/client/test/components/file-bug.test.tsx::AC4: bug icons and the project bug list > lists bugs under no feature on the project bug list, each with the bug icon; packages/client/test/components/file-bug.test.tsx::AC4: bug icons and the project bug list > keeps a feature's bug under it, with the bug icon, and no icon on a story; packages/client/test/components/file-bug.test.tsx::AC4: bug icons and the project bug list > says so when the project has no bugs; packages/work-format/test/bug-filing.test.ts::the project bug list > lists bugs under no feature apart, in order; a feature's bugs stay under it; packages/work-format/test/bug-filing.test.ts::Done stays Done > never offers a Done feature, nor a task on a Done story; packages/work-format/test/bug-filing.test.ts::Done stays Done > files a bug blamed on a Done feature on the project list, and leaves the feature as it was; packages/server/test/bug-filing.test.ts::a Done feature stays Done (AC4) > is never offered, is refused by key, and is left as it was when a bug is blamed on it; packages/server/test/report-bug.test.ts::report_bug (AC1, AC3) > files nothing when the proposed feature is Done by Create, and tells the Dev Lead why (review 3); apps/desktop/e2e/file-bug.spec.ts)

## Tasks

- [x] Placement rules in work-format: the choices, the proposal from routeProblem, the bug card and the task
- [x] Filing on the server: IDs, the owner's copy, a commit on a feature branch that isn't checked out
- [x] report_bug: the Dev Lead's tool, an approval card with the placement to confirm or change, Create and Cancel
- [x] New bug in Work: title, description, suspected cause, and the same placement confirm
- [x] Bug icon on bug rows, and the project bug list in Work
- [x] Unit, integration and e2e tests; link each AC
- [x] Record build choices in decisions.md and the ADR

## Notes
