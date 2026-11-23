---
id: STORY-25
type: story
title: Choose the project's proof and capture screenshots
status: New
parent: FEAT-9
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I choose once how I want to check stories before accepting them, and get screenshots without extra installs or tokens.

## Acceptance criteria

- [ ] When the first feature is shaped, the Dev Lead asks once for the project's proof: screenshots, a Preview button, both, or neither; the answer is a project setting I can change later
- [ ] Featra captures screenshots with Electron's built-in Chromium; no browser download or extra dependency
- [ ] Screenshots produced by the project's own tests are attached to the matching criteria when present
- [ ] Capturing screenshots spends no agent tokens
- [ ] Captured and attached screenshots show next to their criteria, as STORY-72 shows evidence

## Tasks

- [ ] Break down when picked up

## Notes

Reshaped with the user on 2026-11-23: the design review of screenshots moved to STORY-73, and showing evidence to STORY-72.

## Depends on

- STORY-72 See attached evidence next to criteria
