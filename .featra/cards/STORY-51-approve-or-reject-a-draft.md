---
id: STORY-51
type: story
title: Approve or reject a draft
status: Done
parent: FEAT-4
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-51-approve-reject
pr: https://github.com/MPiland/featra/pull/23
created: 2026-11-10T03:47:43Z
history:
  - at: 2026-11-10T03:47:43Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-10T10:00:00Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-10T12:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
  - at: 2026-11-10T09:17:02Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-10T13:04:49Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-10T13:04:49Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As a builder, I approve a draft to make it the feature's scope, or reject it.

## Acceptance criteria

- [x] Approve marks the feature approved, sets its scope baseline, and commits the cards to main locally, without pushing
- [x] Reject removes the draft cards, leaving nothing in git
- [x] After approval, Send back and Reject disappear; the chat stays open

## Tasks

- [x] work-format: planApproval (baseline, cancelled stories dropped, history) and scopeBaseline reads it
- [x] server: approve in the card lane (guards, pathspec commit, rollback) and reject (tracked-file check)
- [x] protocol, api and client bridge: draft.approve and draft.reject
- [x] client: Approve and Reject (confirm) beside Send back, in the chat pane and Work's pane
- [x] tests: work-format, server (real git), client, Playwright journey
- [x] ADR 0023, decisions.md, CONTEXT.md

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
- 2026-11-10: accepted by the user without a hands-on check; a true UAT comes later.
