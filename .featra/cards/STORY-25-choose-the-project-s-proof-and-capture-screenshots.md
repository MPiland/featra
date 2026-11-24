---
id: STORY-25
type: story
title: Choose the project's proof and capture screenshots
status: In Progress
parent: FEAT-9
order: 6
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-25-proof
pr: null
created: 2026-11-05T17:13:05Z
history:
  - at: 2026-11-05T17:13:05Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-24T16:32:50Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
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

Decided with the user on 2026-11-24 (dev lead):

- Screenshots come from the project's dev server. Project settings name a dev-server command and its URL. When a story moves to review, Featra starts that server in the story's worktree, opens the pages the agent listed for each criterion in a hidden window, captures them with Electron's Chromium, and attaches them as the criterion's evidence. The agent names the pages through its normal `update_card` call; the capture itself spends no tokens.
- Preview starts the story's dev server and opens it in a Featra window, so the builder can try the story before Accept. The full in-app browser with annotations stays on the roadmap.

## Depends on

- STORY-72 See attached evidence next to criteria
