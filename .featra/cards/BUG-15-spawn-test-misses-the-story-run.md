---
id: BUG-15
type: bug
title: Spawn test sometimes misses the story's run
status: Acceptance
parent: FEAT-5
order: 7
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-15-spawn-test-race
pr: "30"
created: 2026-11-11T20:00:00Z
history:
  - at: 2026-11-11T20:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T20:30:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-15
  - at: 2026-11-11T21:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-15
  - at: 2026-11-11T19:43:02Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

On CI the Gate once failed in `packages/mcp/test/spawn.test.ts`, "starts the story's session with the model, effort and
brief it was given, and says it started": `expected undefined to match { model: 'opus', effort: 'high' }`. A rerun
passed. The test looks up the story's run right after `spawn_session` answers "Started", and that run was not there yet.

## Acceptance criteria

- [x] The cause is found: either the test reads too early, or "Started" is answered before the session has been started. If it is the product, "Started" is said only once the session is started.
- [x] A regression test that fails on the old code reproduces the race (for example by delaying the provider's start).
- [x] The original assertions stay as they are.

## Tasks

- [x] Find the cause in the spawn path
- [x] Regression test with a slow SDK start, failing before the fix
- [x] `started` on the provider session; the story launch waits for it

## Notes

Cause (product): `begin` in `chat-stories.ts` called `agent.send(first)`, which starts the Claude agent in the
background (find `claude`, attach the MCP, load the SDK, then `query`). The spawn answered "Started" before `query` had
run, so a fast reader could see no run yet. Fix: `ProviderSession.started()` settles once the agent is running (or its
start failed); the story launch awaits it. Test: `packages/server/test/story-spawn-started.test.ts` (SDK load delayed
300 ms; failed with 0 runs at the answer on the old code). The original assertions in `spawn.test.ts` are unchanged.
