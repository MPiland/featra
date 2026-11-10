---
id: STORY-53
type: story
title: Watch, stop and resume a story agent
status: New
parent: FEAT-5
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-10T18:00:00Z
history:
  - at: 2026-11-10T18:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

As the user, I watch a story agent work live and can stop and resume it, without talking to it directly.

## Acceptance criteria

- [ ] Opening a story session shows its live transcript read-only, with no composer, including the agent's thinking where the provider exposes it
- [ ] Stop ends the running turn; the card keeps its stage, gets a Stopped mark and a history event, and the worktree and its changes are untouched
- [ ] Resume continues the same provider session (same transcript) and clears Stopped with a history event
- [ ] A stopped session does not count toward the running-sessions cap

## Tasks

- [ ] Break down when picked up

## Notes
