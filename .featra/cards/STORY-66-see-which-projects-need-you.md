---
id: STORY-66
type: story
title: See which projects need you
status: In Progress
parent: FEAT-20
order: 1
origin: added
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-66-projects-need-you
pr: null
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
---

## Description

As a builder with several projects open, I see in the project switcher which projects have agents waiting on me or work to review, so I know where to go next.

## Acceptance criteria

- [ ] Each project in the switcher's menu shows how many of its agents are waiting on me: an unanswered question or a tool approval, inline or in the Inbox; several requests from one agent count once
- [ ] A project with a draft feature to review or a story at Acceptance shows a quieter review mark beside its name, separate from the count
- [ ] The closed switcher shows a dot when another project has waiting agents or reviews, and none for the current project's own
- [ ] Counts, marks and the dot update live as requests arrive and are answered, in every project, without reopening the menu
- [ ] A screen reader hears each project's name with its count and review mark, and the dot's meaning on the closed switcher

## Tasks

- [ ] Rules: what counts as a waiting agent and a review, as pure functions in `work-format` or the server, unit-tested per kind
- [ ] Server: per-project counts pushed to the client for every open project
- [ ] Client: the switcher's dot and the menu's counts and marks, with short sentence-case labels
- [ ] Unit and integration tests for each criterion; one journey across two projects; tests linked on the criteria
- [ ] Decisions recorded for the Dev Lead; move to In Review

## Depends on

- STORY-7 Inbox and notifications
- STORY-45 Inline tool approvals
