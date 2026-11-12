---
id: STORY-55
type: story
title: Native subagents appear nested
status: In Review
parent: FEAT-5
order: 6
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
  - at: 2026-11-11T23:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-55
  - at: 2026-11-12T00:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-55
---

## Description

As the user, I see the subagents any session spawns for itself, nested under it, and can stop one where the provider allows.

## Acceptance criteria

- [x] A subagent spawned by a session appears nested under that session in the sidebar with its live transcript, read-only (tests: packages/server/test/chat-subagents.test.ts, packages/client/test/components/chat-subagent.test.tsx, apps/desktop/e2e/nested-subagents.spec.ts)
- [x] Stop on a nested subagent stops only that subagent where the provider supports it (Claude background subagents); otherwise no Stop is shown (tests: chat-subagents.test.ts "AC2", claude-subagents.test.ts "Stop", chat-subagent.test.tsx "AC2", nested-subagents.spec.ts)
- [x] An ended subagent stays nested, marked ended, until its session ends or it is archived; at most 20 ended per session, oldest dropped first (tests: chat-subagents.test.ts "what an ended subagent leaves", claude-subagents.test.ts, chat-subagent.test.tsx "ended subagent")
- [x] Stop on a session also stops its background subagents (tests: chat-subagents.test.ts "Stop on the session", claude-subagents.test.ts)
- [x] Tool approvals and questions from a subagent are labelled with that subagent (tests: chat-subagents.test.ts "AC3", packages/work-format/test/chat-subagent.test.ts, chat-subagent.test.tsx "AC3", nested-subagents.spec.ts)

## Tasks

- [x] Provider seam: `SubagentEvent`, `SessionOptions.subagent`, `ProviderSession.stopSubagent`, request labels (test: packages/server/test/claude-subagents.test.ts)
- [x] Claude adapter: forward subagent text, route task and subagent messages to their own transcript, label approvals and questions, stop one task (test: packages/server/test/claude-subagents.test.ts)
- [x] Session manager: a read-only subagent chat nested under its parent, Stop on it, gone with its parent (test: packages/server/test/chat-subagents.test.ts)
- [x] Pure rules in work-format: summary ref, nesting, event labels (test: packages/work-format/test/chat-subagent.test.ts)
- [x] Sidebar nesting, read-only transcript with Stop, labelled approvals and questions (test: packages/client/test/components/chat-subagent.test.tsx)
- [x] ADR 0030, CONTEXT.md term, decisions.md build choices, and the Playwright journey (written, run in CI only)

## Notes

AC2 is supported by the SDK, so Stop is offered for a Claude background subagent. Evidence from the SDK types
(`@anthropic-ai/claude-agent-sdk` sdk.d.ts): `Query.stopTask(taskId: string): Promise<void>` ends one task; `Options.forwardSubagentText`
tags a subagent's messages with `parent_tool_use_id` and `agent_id`; `task_started` carries `task_id`, `tool_use_id`,
`task_type` (`local_agent`) and `is_backgrounded` (true when registered in the background, false when the spawning call
blocks on it; a later move arrives as `task_updated.patch.is_backgrounded`); `canUseTool`'s options carry `agentID`. A
foreground subagent is ended only with its turn, so it shows no Stop. Build choices and the unverified-shape risk are in
decisions.md ("STORY-55 build choices") and ADR 0030. Restoring subagents after a restart is on the roadmap.

The Playwright journey (`apps/desktop/e2e/nested-subagents.spec.ts`) is written and runs in CI only.

Review rulings are in decisions.md ("STORY-55 review rulings"). Worktrees: the SDK does not expose a subagent's worktree.
Evidence: `SDKTaskStartedMessage`, `task_updated` and the SubagentStart and SubagentStop hook inputs have no worktree
path, and only the WorktreeCreate and WorktreeRemove hook inputs exist, with no subagent isolation field. Archive
therefore removes the row only, and "clean up subagent worktrees" is on ROADMAP.md.

UAT (user): the real claude message shapes are unverified against a real run. UAT includes one real foreground and one
real background subagent run.
