---
id: STORY-11
type: story
title: Story PR and PR chip
status: New
parent: FEAT-6
order: 2
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
---

## Description

As a builder on GitHub, each story's PR is opened for me and its state and checks show on the card.

## Acceptance criteria

- [ ] Featra detects per project whether GitHub is usable (a GitHub remote and a signed-in `gh`); when it is not, the project is in local mode and project settings say in one line what is missing
- [ ] With the project setting "Open story PRs automatically" on (the default), a story moving to In Review has its branch pushed and a PR opened against the feature branch through the user's `gh`; with it off, the card shows Create PR
- [ ] The card and the Work row show a PR chip labelled with the PR number (`#14`), never the raw URL, linking to the PR, with its state and checks; the full URL shows on hover
- [ ] Featra re-reads open PRs every N minutes (a project setting, default 2) and when the window regains focus, using no tokens
- [ ] When the project's checks run on CI, passing required checks mark the story Verified, and a failing check removes Verified

## Tasks

- [ ] Break down when picked up

## Notes

## Depends on

- STORY-56 Local checks and where checks run
