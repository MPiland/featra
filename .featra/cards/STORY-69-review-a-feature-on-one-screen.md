---
id: STORY-69
type: story
title: Review a feature on one screen
status: Done
parent: FEAT-9
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-69-review-screen
pr: https://github.com/MPiland/featra/pull/83
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-23T15:34:42Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
  - at: 2026-11-23T20:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-69
  - at: 2026-11-23T21:16:09Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-23T21:16:09Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

As a builder, I review a whole feature on one screen, with what changed and the proof behind every criterion, without opening each story or asking the Dev Lead.

## Acceptance criteria

- [x] A Review button on any active feature's Work row and card pane opens the approval screen, whatever stage its stories are in (test: packages/client/test/components/review-screen.test.tsx::the review screen's header (STORY-69, from the screenshot review) > lines Back up with the title and content: the action button's own left margin doesn't apply; packages/client/test/components/review-screen.test.tsx::Review on an active feature (STORY-69 AC1) > is on the feature's Work row, not on a feature not started, and Back returns to the row; packages/client/test/components/review-screen.test.tsx::Review on an active feature (STORY-69 AC1) > is on the feature's card pane too; apps/desktop/e2e/review-feature.spec.ts::Review a feature: summary, proof and run links, Files changed, then the Dev Lead's summary)
- [x] The screen opens with a summary built from the cards and git, at zero tokens: each story's user story and stage, scope added since start, the feature's bugs, and the files and lines changed per story (test: packages/client/test/components/review-screen.test.tsx::the review screen's header (STORY-69, from the screenshot review) > says the stories done once, and beside it only the stages not done; packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > opens on a summary from the cards and git: each story's user story, stage, diff, criteria and proof (AC2, AC3); packages/client/test/components/review-screen.test.tsx::the review screen (STORY-69 AC2, AC3, AC5) > shows each story's user story, stage, changes and criteria with their proof and run; packages/work-format/test/review.test.ts::git's diff counts (STORY-69 AC2) > sum files and lines; a binary file counts as a file with no lines; packages/work-format/test/review.test.ts::a story's merge into its feature (STORY-69 AC2) > is Featra's merge, its PR's merge on GitHub, or git's, the newest first; packages/work-format/test/review.test.ts::a story's merge into its feature (STORY-69 AC2) > is none for another story, a PR with a longer number, or a commit with one parent; packages/work-format/test/review.test.ts::a story's merge into its feature (STORY-69 AC2) > is every round of a story merged, sent back and merged again, the newest first; packages/work-format/test/review.test.ts::git's diff counts (STORY-69 AC2) > count a file changed in more than one round once, and every round's lines; packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > counts a commit pushed to an open story's branch that no worktree has checked out (AC2); packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > counts every round of a story merged, sent back and merged again (AC2); apps/desktop/e2e/review-feature.spec.ts::Review a feature: summary, proof and run links, Files changed, then the Dev Lead's summary)
- [x] Each story lists its criteria with the linked test, its result (passed, failed, missing or no test) and a link to the run that proved it: the CI run, or "Local run" (test: packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > opens on a summary from the cards and git: each story's user story, stage, diff, criteria and proof (AC2, AC3); packages/client/test/components/review-screen.test.tsx::the review screen (STORY-69 AC2, AC3, AC5) > shows each story's user story, stage, changes and criteria with their proof and run; packages/work-format/test/proof-run.test.ts::the card view's run beside each criterion (AC3) > shows the run only beside a passed criterion, and carries it across the socket; packages/work-format/test/proof-run.test.ts::the proving run kept with the proof (AC4) > refuses a run on another host or in another repository than the card's PR, as an edited card might hold; packages/work-format/test/review.test.ts::the review as the client reads it (STORY-69) > names a run on this computer and links a CI run; apps/desktop/e2e/review-feature.spec.ts::Review a feature: summary, proof and run links, Files changed, then the Dev Lead's summary)
- [x] The run that proves a criterion is stored with the proof, so its link survives a restart (test: packages/work-format/test/proof-run.test.ts::the proving run kept with the proof (AC4) > records each proof's run right after it, by the same writer: a CI run's link or a local run; packages/work-format/test/proof-run.test.ts::the proving run kept with the proof (AC4) > survives writing the card and reading it back, as after a restart; packages/work-format/test/proof-run.test.ts::the proving run kept with the proof (AC4) > forgets the run when the criterion is proven again without one, or stops being proven; packages/server/test/proof-run-local.test.ts::a local run kept with its proof (STORY-69 AC4) > still shows the local run after the server starts again, read from the card's file; packages/server/test/proof-run-ci.test.ts::the CI run kept with its proof (STORY-69 AC4) > links each proven criterion to the run whose report proved it, and nothing to one not proven; packages/server/test/proof-run-ci.test.ts::the CI run kept with its proof (STORY-69 AC4) > drops the link when a new head unproves the criterion; packages/work-format/test/proof-run.test.ts::which CI run proved a criterion > is the first run whose own report passes every test the criterion links, else the newest run holding one; packages/work-format/test/proof-run.test.ts::which CI run proved a criterion > links no run when no run's report holds any test the criterion links; packages/work-format/test/proof-run.test.ts::the proving run kept with the proof (AC4) > records the newer run when another run proves the criterion again at the same commit)
- [x] The screen shows the feature's own checks and links to GitHub's Files changed for the whole feature and for each story's PR (test: packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > links GitHub's Files changed for the feature and each story's PR, with the feature's checks (AC5); packages/client/test/components/review-screen.test.tsx::the feature's checks on the review screen (STORY-69 AC5) > shows the feature's last run, its failing output and Re-run, once its checks have run; packages/work-format/test/review.test.ts::Files changed links (STORY-69 AC5) > are a GitHub PR's files tab, or nothing for anything else; packages/work-format/test/review.test.ts::Files changed links (STORY-69 AC5) > compare a branch with its base before it has a PR, and refuse what isn't safe; packages/client/test/components/review-screen.test.tsx::the review screen (STORY-69 AC2, AC3, AC5) > shows each story's user story, stage, changes and criteria with their proof and run; apps/desktop/e2e/review-feature.spec.ts::Review a feature: summary, proof and run links, Files changed, then the Dev Lead's summary)
- [x] A summary the Dev Lead wrote through the MCP shows under its own heading, marked as written by the Dev Lead; without one, the heading doesn't show (test: packages/client/test/components/review-screen.test.tsx::the review screen's header (STORY-69, from the screenshot review) > marks the summary as the Dev Lead's in plain secondary text, not as a link; packages/mcp/test/write-summary.test.ts::write_summary through the Featra MCP (STORY-69 AC6) > writes the summary into the feature's card on its branch, as the Dev Lead's chat; packages/mcp/test/write-summary.test.ts::write_summary through the Featra MCP (STORY-69 AC6) > refuses a story session, any other chat that isn't the Dev Lead, a feature not in progress, bad input and a project with the MCP off; packages/mcp/test/write-summary.test.ts::write_summary through the Featra MCP (STORY-69 AC6) > is listed with the description that teaches the Dev Lead when and what to write; packages/work-format/test/feature-summary.test.ts::the Dev Lead's summary of a feature (AC6) > is kept in the card, with who wrote it and when, and survives writing the card and reading it back; packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > shows the Dev Lead's summary once written, and updates live as a story moves (AC6, AC7); packages/client/test/components/review-screen.test.tsx::the review screen, live (STORY-69 AC6, AC7) > shows the Dev Lead's summary once written, a story's new stage and new proof, without reopening; packages/client/test/components/review-screen.test.tsx::the review screen (STORY-69 AC2, AC3, AC5) > shows each story's user story, stage, changes and criteria with their proof and run; apps/desktop/e2e/review-feature.spec.ts::Review a feature: summary, proof and run links, Files changed, then the Dev Lead's summary)
- [x] The screen updates live as stories move, checks finish and proof arrives (test: packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > shows the Dev Lead's summary once written, and updates live as a story moves (AC6, AC7); packages/client/test/components/review-screen.test.tsx::the review screen, live (STORY-69 AC6, AC7) > shows the Dev Lead's summary once written, a story's new stage and new proof, without reopening; packages/server/test/review-watch.test.ts::a feature's review screen (STORY-69) > pushes a story's new proof and its run, as the evidence writer records them, without reopening (AC7))

## Tasks

- [x] Store the proving run with the proof (ran: events), local and CI
- [x] write_summary MCP tool and the feature card's Summary section
- [x] review.watch: the review built from cards and git, live
- [x] Review button on the row and card pane, and the review screen
- [x] E2E journey and ux screenshots

## Notes

Shaped with the user on 2026-11-23. The approval screen is a full view, not the card pane. The summary costs no tokens; prose from the Dev Lead is optional and labelled. The diff stays on GitHub until the FEAT-14 Changes pane.
