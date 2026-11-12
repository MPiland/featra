---
id: STORY-23
type: story
title: Accept or send back a story
status: Acceptance
parent: FEAT-6
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
  - at: 2026-11-12T09:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-23
  - at: 2026-11-12T11:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-23
  - at: 2026-11-12T16:11:23Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

As a builder, when a story is ready I accept it, or send it back with a reason, from wherever I am looking at it. It works with or without GitHub.

## Acceptance criteria

- [x] A story in Acceptance shows Accept and Send back at the end of its chat, in its card pane and in its Work row (tests: packages/work-format/test/acceptance.test.ts "awaiting acceptance", packages/client/test/components/accept-story.test.tsx "AC1", apps/desktop/e2e/accept-story.spec.ts)
- [x] Accept records Accepted in the card's history, by the user; when the story is also Verified (or needs Accept only, as a Researcher story) it moves to Done (tests: acceptance.test.ts "Accept" and "settling to Done", packages/server/test/story-acceptance.test.ts "AC2", accept-story.test.tsx "AC2", accept-story.spec.ts)
- [x] Send back requires a reason; the reason is sent to the story's session as the user's message, logged in history, the story returns to In Progress, and the reason can be added as a new acceptance criterion (tests: acceptance.test.ts "Send back", story-acceptance.test.ts "AC3", accept-story.test.tsx "AC3", accept-story.spec.ts)
- [x] After Accept, Send back disappears everywhere; the chat stays open, and later changes come in as added scope or bugs (tests: acceptance.test.ts "refusals", story-acceptance.test.ts "AC4", accept-story.test.tsx "AC4", accept-story.spec.ts)

## Tasks

- [x] Rules in work-format: awaiting acceptance, Accept, settle to Done, Send back (reuse sendBackMessage)
- [x] Work list rows and card views carry whether Accept and Send back apply
- [x] Server: accept and send back a story (owner copy, history, message to the session), protocol and api
- [x] Client: bridge, Accept and Send back (with Add as criterion) in the card pane, the Work row and the chat end
- [x] Unit, integration and component tests for each criterion
- [x] Playwright journey test; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; move to In Review

## Notes

- Verified is written by nothing yet, so an accepted but unverified story stays in Acceptance. `settleDone` (work-format) is the rule STORY-11 and STORY-56 call when Verified arrives.
- Stories only; bugs have no Accept and Send back here.
