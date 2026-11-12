---
id: STORY-56
type: story
title: Local checks and where checks run
status: New
parent: FEAT-6
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-11T20:00:00Z
history:
  - at: 2026-11-11T20:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder without CI, or with limited CI minutes, Featra runs my project's checks on this computer, so stories can still be Verified and Proven.

## Acceptance criteria

- [ ] A project setting chooses where checks run: CI or this computer; it defaults to CI when the repo is public on GitHub and has workflows, otherwise this computer
- [ ] Featra proposes a check command from the project's files (for example the `test` script in `package.json`), or the Dev Lead proposes one; the user confirms or edits it in project settings
- [ ] When checks run on this computer, Featra runs the check command in the story's worktree when the story moves to In Review and when new commits land there; the card has Re-run
- [ ] A passing run marks the story Verified; a failing run removes Verified and the card shows the failing output
- [ ] Each acceptance criterion's linked test is run too; a passing linked test marks that criterion Proven

## Tasks

- [ ] Break down when picked up

## Notes
