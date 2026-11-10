---
id: STORY-50
type: story
title: Send a draft back
status: In Progress
parent: FEAT-4
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-50-send-back
pr: null
created: 2026-11-10T03:47:43Z
history:
  - at: 2026-11-10T03:47:43Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-10T06:10:00Z
    field: status
    from: New
    to: In Progress
    by: developer
---

## Description

As a builder, I send a draft back to the Dev Lead with a reason, so it revises the draft.

## Acceptance criteria

- [ ] Send back… asks for a reason and can't be sent without one
- [ ] The reason is sent to the Dev Lead as the user's message in that chat
- [ ] The send-back is recorded in the feature's history

## Tasks

- [x] work-format: `sent-back` history entry; the draft guard ignores it; the card view names the draft's chat
- [x] Server: one `draft.sendBack` method sends to the chat, then records history (nothing on a failed send)
- [x] Client: Send back… with a required reason in the chat's draft pane and in Work's card pane
- [x] Add the e2e journey `send-back.spec.ts`
- [x] Decisions, ADR note

## Notes

- Split from the original STORY-8 on 2026-11-10 (decisions.md).
