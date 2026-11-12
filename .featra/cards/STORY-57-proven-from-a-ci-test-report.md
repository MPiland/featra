---
id: STORY-57
type: story
title: Proven from a CI test report
status: New
parent: FEAT-6
order: 4
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

As a builder whose checks run on CI, criteria are Proven by the test results CI already produces.

## Acceptance criteria

- [ ] A project setting names the test report CI uploads (JUnit XML); Proven from CI is off until it is set
- [ ] When a PR's checks finish, Featra reads the report and marks Proven each criterion whose linked test passed
- [ ] A criterion whose linked test failed or is missing from the report stays unproven, and the card says which

## Tasks

- [ ] Break down when picked up

## Notes

## Depends on

- STORY-11 Story PR and PR chip
