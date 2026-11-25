---
id: STORY-73
type: story
title: Design review of screenshots
status: In Progress
parent: FEAT-9
order: 7
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-73-design-review
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-25T04:01:56Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
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

Decided with the user on 2026-11-24 (dev lead):

- The Dev Lead reviews. When a story with screenshots reaches the review stage, the Dev Lead chat that delegated it checks the screenshots for layout and design problems. It records findings or clears the check through `update_card`, and sends findings to the story's session. Featra doesn't move the story to Acceptance until the check is cleared.
- The check is on by default when the project's proof includes screenshots. The project can turn it off in Settings.

## Depends on

- STORY-25 Choose the project's proof and capture screenshots
