---
id: STORY-33
type: story
title: New-project onboarding
status: New
parent: FEAT-16
order: 1
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

As a builder, I can follow a short, skippable setup when I create or open a project.

## Acceptance criteria

- [ ] After New project or Open folder, an optional guided setup runs; every step can be skipped
- [ ] Steps cover git init, `.featra/`, knowledge files, Artifact folders, acceptance proof and role presets
- [ ] Skipping leaves the project usable with defaults
- [ ] A step asks where checks run (CI or this computer), explains in plain words what CI is, and says that private GitHub repos have limited free CI minutes

## Tasks

- [ ] Break down when picked up

## Notes

- 2026-11-06: The one-screen setup page (git, `.featra/`, knowledge files, starter `.gitignore`, Workflow settings)
  moved forward into FEAT-2 as STORY-42 at the user's request. This story now adds its remaining sections to that
  page: artifact folders, acceptance proof, role presets and agent instructions.
