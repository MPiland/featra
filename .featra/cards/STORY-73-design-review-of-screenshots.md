---
id: STORY-73
type: story
title: Design review of screenshots
status: New
parent: FEAT-9
order: 7
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

As a builder, layout and design problems in a story's screenshots are caught before the story reaches me for Accept.

## Acceptance criteria

- [ ] Before a story moves to Acceptance, the reviewing agent checks its screenshots for layout and design problems
- [ ] Findings are sent to the story's session, and the story stays in review until they're addressed or the reviewer clears them
- [ ] A story with no screenshots moves on without this check
- [ ] The project can turn the check off

## Tasks

- [ ] Break down when picked up

## Notes

Shaped with the user on 2026-11-23, split out of STORY-25. This check spends agent tokens because an agent does it; it's part of the agent's review, not an app feature.

## Depends on

- STORY-25 Choose the project's proof and capture screenshots
