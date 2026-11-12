---
id: STORY-54
type: story
title: Story agents report to the Dev Lead
status: Done
parent: FEAT-5
order: 5
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-10T18:00:00Z
history:
  - at: 2026-11-10T18:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T20:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-54
  - at: 2026-11-11T21:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-54
  - at: 2026-11-11T22:40:36Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
  - at: 2026-11-11T22:58:59Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-11T22:58:59Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

As the user, I let the Dev Lead coordinate the story agents: they report to it, and it steers them.

## Acceptance criteria

- [x] When a story session ends a turn, stops or fails, a short notice (story, outcome, a summary of its last message) is posted into the Dev Lead's chat (test: packages/server/test/story-notices.test.ts::AC1: a notice in the Dev Lead's chat > says the story's turn ended, with the last of what it said, as one message the Dev Lead's agent hears; packages/server/test/story-notices.test.ts::AC1 > says the story failed, with why; packages/server/test/story-notices.test.ts::AC1 > says the story stopped when the user stops it; packages/server/test/story-notices-queue.test.ts::AC1: a story taken off the queue; packages/work-format/test/story-notice.test.ts::summaries, noticeMessage; e2e, run in CI only: apps/desktop/e2e/story-notice.spec.ts)
- [x] A story agent's `ask_user` goes to the Dev Lead as a notice; the Dev Lead answers it with `message_session` or escalates to the user with `ask_user` (test: packages/server/test/story-notices-ask.test.ts::AC2: a story's question > goes to the Dev Lead as a notice once its turn ends, and the session is told so, not the user asked; packages/server/test/story-notices-ask.test.ts::AC2 > is answered by the Dev Lead with message_session, which the story's session hears; packages/server/test/story-notices-ask.test.ts::AC2 > can instead be escalated: the Dev Lead asks the user itself, and the user answers it)
- [x] `message_session(story, text)` from the Dev Lead sends to that story's session, resuming it when idle; any other chat calling it is refused (test: packages/server/test/story-message.test.ts::AC3: message_session > sends to the session of the Dev Lead's story, in the same provider session, when it is idle; packages/server/test/story-message.test.ts::AC3 > is refused to any other chat, including another Dev Lead and a story session; packages/server/test/story-message.test.ts::AC3 > is refused to a session the user Stopped: 'Only the user can resume it', and the story stays Stopped; packages/mcp/test/message-session.test.ts::message_session through the Featra MCP; packages/work-format/test/story-notice.test.ts::messageRefusal)
- [x] Notices that arrive while the Dev Lead is busy are delivered together when it is idle, not one turn per notice (test: packages/server/test/story-notices.test.ts::AC4: notices that arrive while the Dev Lead is busy > wait, and go in one message when its turn ends, not one turn each)

## Tasks

- [x] Pure rules in work-format: notice lines and batching text, last-message summary, `message_session` input and refusals (test: packages/work-format/test/story-notice.test.ts)
- [x] Notices: the app writes one when a story session's turn ends, stops or fails, queues them while the Dev Lead is busy, delivers them as one message (test: packages/server/test/story-notices.test.ts)
- [x] A story's question goes to the Dev Lead as a notice (the session's tool call is refused so its turn ends); the user is asked only when there is no Dev Lead (test: packages/server/test/story-notices-ask.test.ts)
- [x] `message_session` through the agent socket and the MCP: Dev Lead only, resumes an idle session, refused when stopped, working or queued (test: packages/server/test/story-message.test.ts; packages/mcp/test/message-session.test.ts)
- [x] ADR 0028, CONTEXT.md terms, decisions.md rulings and the Playwright journey (written, run in CI only) (docs/adr/0028-story-agents-report-to-the-dev-lead.md; e2e written, runs in CI only)

## Notes

- 2026-11-11 (from STORY-53): `message_session` to a story session that is Stopped must either clear Stopped (with a history event, like Resume) or be refused with a clear message. Decide it here and prove it with a test.
- 2026-11-11 (STORY-54): decided: refused with "STORY-N is stopped. Only the user can resume it."; the story stays Stopped (story-message.test.ts). Rulings in decisions.md.
