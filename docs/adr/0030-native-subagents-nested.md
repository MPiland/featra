# 0030 — Native subagents appear nested under their session

Date: 2026-11-11 · Status: accepted

## Context

A session's agent can spawn subagents for itself (Claude's Agent tool). Until now Featra showed only the call's row in the
parent's transcript, and each subagent's own work, its tool approvals and its questions came through as the session's own.
STORY-55 shows each subagent as what it is: a read-only transcript nested under the session that spawned it, with Stop
where the provider allows it and a label on what it asks.

## Decision

- **A subagent is an in-memory, read-only chat.** The session manager adds one chat per subagent to its map, with the same
  event log, watch and list row as any chat, and a `subagent: { parent, stoppable }` on its summary. It is never saved
  (the provider owns the real record), and it is removed when its session ends or its project closes. Sending to it is
  refused (`A subagent is read-only.`); its row never waits on the user.
- **The provider reports, the manager shows.** The adapter seam gains `SubagentEvent` (`started`, `updated`, `event`,
  `ended`), `SessionOptions.subagent` and an optional `ProviderSession.stopSubagent`. No provider-specific word reaches the
  manager or the client (ADR 0018). A provider with no subagents never calls it, and a provider that cannot stop one omits
  `stopSubagent`.
- **Claude: told apart from the one SDK stream.** With `forwardSubagentText` the SDK tags every message of a subagent's own
  conversation with `parent_tool_use_id` and `agent_id`, and reports its task as `task_started`, `task_updated` and
  `task_notification` (sdk.d.ts: `forwardSubagentText` in `Options`, `is_backgrounded` and `task_type: local_agent` on the
  task messages). `claude-subagents.ts` takes those messages first and gives each subagent a translator of its own, so its
  transcript is the same chat events as any chat's, and the session's translator never sees them.
- **Stop is real only for a background subagent.** The SDK's `Query.stopTask(taskId)` ends one task without ending the
  turn (sdk.d.ts, `Query`). A foreground subagent holds its Agent call open, and the SDK ends it only with the whole turn,
  so it gets no Stop (never a Stop that stops the session). `stoppable` is true only for a background subagent with a known
  task that has not ended, and flips when a `task_updated` moves it to the background. The client stops it through the
  existing `chat.stop`; the manager routes a subagent's id to the provider's `stopSubagent`, never to the session's turn.
- **Approvals and questions stay in the session's chat, labelled.** The SDK's `canUseTool` options carry the asking
  subagent's `agentID` (sdk.d.ts, `CanUseTool`). The request, and the `approval` and `question` events, carry the
  subagent's label, and the prompt says `Asked by the subagent <label>`. They are not moved to the subagent's chat: the
  user answers them where the session already waits, and the waiting dot, the Inbox and the approval desk keep one path.
- **Nesting is flat.** A subagent sits under its session, whichever row that is (a chat, a story session, or a feature
  group). A subagent of a subagent (`spawn_depth`, `parent_task_id`) is shown at the same level. A subagent whose session
  is not in the list gets a row of its own, so none goes missing.

## Consequences

- Subagents are not restored after a restart: the transcript is gone with the process. The SDK can read one back
  (`listSubagents`, `getSubagentMessages`); restoring them is on the roadmap.
- The message shapes (`task_started` fields, which messages carry `agent_id`) are taken from the SDK's types and proved
  against the fake `query`, not against a real `claude`: a first run with a real subagent may need the adapter adjusted.
- `chat.stop` now means two things by chat: the turn for a chat, the one subagent for a subagent. One method, one rule on
  the id, so the client and the protocol did not change.
