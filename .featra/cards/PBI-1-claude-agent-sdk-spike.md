---
id: PBI-1
type: pbi
title: Claude Agent SDK spike
status: Acceptance
parent: FEAT-1
order: 1
origin: planned
role: researcher
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: Ready
    by: user
  - at: 2026-11-05T04:48:35Z
    field: status
    from: Ready
    to: In Progress
    by: session:orchestrator
  - at: 2026-11-05T04:48:35Z
    field: status
    from: In Progress
    to: Acceptance
    by: session:orchestrator
  - at: 2026-11-05T13:44:38Z
    field: accepted
    from: null
    to: accepted
    by: user
---

## Description

Claude Agent SDK spike.

## Acceptance criteria

- [x] SDK runs the user's logged-in `claude` binary without Featra reading any credential file (test: docs/spike-claude-sdk.md#login)
- [x] `canUseTool` intercepts AskUserQuestion and Featra can return the user's answer (test: docs/spike-claude-sdk.md#ask)
- [x] Model and effort can be set per session (test: docs/spike-claude-sdk.md#model)
- [x] A local stdio MCP server attaches to a session and its tools are callable (test: docs/spike-claude-sdk.md#mcp)
- [x] A session runs with a worktree as its working directory (test: docs/spike-claude-sdk.md#cwd)

## Tasks

- [x] Run spike and write docs/spike-claude-sdk.md

## Notes

All five checks pass on the user's installed claude 2.1.301 (see docs/spike-claude-sdk.md). Awaiting user Accept. No CI exists yet, so this is Reported, not Verified.
