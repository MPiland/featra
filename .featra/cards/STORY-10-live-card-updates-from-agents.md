---
id: STORY-10
type: story
title: Agents update their own card
status: New
parent: FEAT-5
order: 4
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

As the user, I see a story agent's progress on its card live, marked Reported, without trusting it as proof.

## Acceptance criteria

- [ ] `update_card` lets a story session move its stage up to Acceptance, tick and add tasks, tick ACs, append notes and link evidence; Done and any other status are refused
- [ ] Writes go to the owner copy (the worktree), append a history event `by: session:<id>`, and show on the feature list live, marked Reported
- [ ] A story session can update only its own card; the Dev Lead can update cards in its feature; any other chat is refused
- [ ] Evidence lives in `.featra/evidence/FEAT-N/STORY-M/` and is committed with the story, kept as small as the story allows; an AC's evidence link must point inside that folder, and the card links the folder

## Tasks

- [ ] Break down when picked up

## Notes

- 2026-11-10 (dev-lead): Reshaped with the user: agent edits are scoped to their own card, and evidence goes in a committed per-feature folder (see decisions.md).
