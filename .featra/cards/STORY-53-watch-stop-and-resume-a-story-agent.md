---
id: STORY-53
type: story
title: Watch, stop and resume a story agent
status: Done
parent: FEAT-5
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-53-watch-stop
pr: "28"
created: 2026-11-10T18:00:00Z
history:
  - at: 2026-11-10T18:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T12:00:00Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-11T18:40:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
  - at: 2026-11-11T19:25:09Z
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

As the user, I watch a story agent work live and can stop and resume it, without talking to it directly.

## Acceptance criteria

- [x] Opening a story session shows its live transcript read-only, with no composer, including the agent's thinking where the provider exposes it (test: packages/client/test/components/stop-resume-story.test.tsx::AC1: watching a story session > opens read-only: the transcript with the agent's thinking, and no composer; packages/server/test/claude-thinking.test.ts::AC1: thinking; packages/work-format/test/chat-thinking.test.ts)
- [x] Stop ends the running turn; the card keeps its stage, gets a Stopped mark and a history event, and the worktree and its changes are untouched (test: packages/server/test/story-stop.test.ts::AC2: Stop > ends the running turn, keeps the stage, marks the card Stopped with a history event, and leaves the worktree alone; packages/client/test/components/stop-resume-story.test.tsx::AC2: Stop)
- [x] Resume continues the same provider session (same transcript) and clears Stopped with a history event (test: packages/server/test/story-stop.test.ts::AC3: Resume > goes on in the same session and transcript, and clears Stopped with a history event; packages/server/test/story-stop.test.ts::AC3: Resume > starts the provider's session again with its id when the agent process has gone; packages/client/test/components/stop-resume-story.test.tsx::AC3: Resume)
- [x] A stopped session does not count toward the running-sessions cap (test: packages/server/test/story-stop-cap.test.ts::AC4: the cap > frees the slot of a stopped session, so the next story starts; packages/server/test/story-stop-cap.test.ts::AC4: the cap > makes Resume wait Queued while the slot is taken, and run when it frees)

## Tasks

- [x] Pure rules in work-format: Stopped derived from history, Stop and Resume refusals, the Work row's stopped flag, the thinking event and transcript item (test: packages/work-format/test/story-stop.test.ts, chat-thinking.test.ts)
- [x] Provider seam: the resumes capability, Resume refuses clearly without it, Claude's summarized thinking (test: packages/server/test/story-stop-cap.test.ts::a provider that can't resume; packages/server/test/claude-thinking.test.ts)
- [x] Server: story.stop and story.resume through the card lane, stopping a running or Queued turn (test: packages/server/test/story-stop.test.ts, packages/server/test/story-stop-cap.test.ts::AC4: the cap > stops a turn that is waiting Queued)
- [x] Client: read-only story session with thinking, Stop, Resume and the Stopped mark in the row and the session (test: packages/client/test/components/stop-resume-story.test.tsx)
- [x] ADR 0026, CONTEXT.md terms, decisions.md and the Playwright journey (written, run in CI only: apps/desktop/e2e/stop-resume-story.spec.ts)

## Notes

- 2026-11-11 (developer): Stopped is derived from history[] (the last stopped event), not a card field; see ADR 0026.
- 2026-11-11 (developer): start-story.test.tsx asserted that a story session shows the composer; AC1 reverses that, so it now asserts the read-only transcript. Not a weakened proof: the behaviour is the one this story changes.
- 2026-11-11 (developer): Review fixes (PR 28), each with its test: queued never-started Stop drops it from the queue (packages/server/test/story-stop-queue.test.ts, packages/client/test/components/stop-resume-story.test.tsx::Stop on a story that waits in the queue, packages/work-format/test/story-stop.test.ts::a story dropped from the queue); card written first, bounded interrupt (packages/server/test/story-stop-order.test.ts); Stopped limited to non-terminal stages (packages/work-format/test/story-stop.test.ts::Stopped does not outlive the session); thinking only on models that support it (packages/server/test/claude-thinking.test.ts); Resume on a stalled idle session (packages/server/test/story-stop-queue.test.ts::Resume on an idle session whose turn failed, packages/server/test/story-resume-restart.test.ts, packages/work-format/test/chat-list.test.ts::STORY-53, packages/client/test/components/stop-resume-story.test.tsx::Resume on an idle session that ended without finishing); Resume after a restart (packages/server/test/story-resume-restart.test.ts); Stop mirrored to the Dev Lead closes the copy (packages/server/test/story-mirror.test.ts).
- 2026-11-11 (developer): A never-started queued story's card is on the feature branch, so the queue-drop history event is written only where the owner copy is writable (normally not); see ADR 0026.
- 2026-11-11 (developer): Open for STORY-54: a message_session to a stopped story session either clears Stopped (with a history event) or is refused; decided there.
