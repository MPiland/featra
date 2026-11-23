---
id: STORY-69
type: story
title: Review a feature on one screen
status: New
parent: FEAT-9
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I review a whole feature on one screen, with what changed and the proof behind every criterion, without opening each story or asking the Dev Lead.

## Acceptance criteria

- [ ] A Review button on any active feature's Work row and card pane opens the approval screen, whatever stage its stories are in
- [ ] The screen opens with a summary built from the cards and git, at zero tokens: each story's user story and stage, scope added since start, the feature's bugs, and the files and lines changed per story
- [ ] Each story lists its criteria with the linked test, its result (passed, failed, missing or no test) and a link to the run that proved it: the CI run, or "Local run"
- [ ] The run that proves a criterion is stored with the proof, so its link survives a restart
- [ ] The screen shows the feature's own checks and links to GitHub's Files changed for the whole feature and for each story's PR
- [ ] A summary the Dev Lead wrote through the MCP shows under its own heading, marked as written by the Dev Lead; without one, the heading doesn't show
- [ ] The screen updates live as stories move, checks finish and proof arrives

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-23. The approval screen is a full view, not the card pane. The summary costs no tokens; prose from the Dev Lead is optional and labelled. The diff stays on GitHub until the FEAT-14 Changes pane.
