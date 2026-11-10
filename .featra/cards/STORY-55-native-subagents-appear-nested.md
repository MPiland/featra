---
id: STORY-55
type: story
title: Native subagents appear nested
status: New
parent: FEAT-5
order: 6
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

As the user, I see the subagents any session spawns for itself, nested under it, and can stop one where the provider allows.

## Acceptance criteria

- [ ] A subagent spawned by a session appears nested under that session in the sidebar with its live transcript, read-only
- [ ] Stop on a nested subagent stops only that subagent where the provider supports it (Claude background subagents); otherwise no Stop is shown
- [ ] Tool approvals and questions from a subagent are labelled with that subagent

## Tasks

- [ ] Break down when picked up

## Notes
