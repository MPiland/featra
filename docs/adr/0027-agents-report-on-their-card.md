# 0027 — Agents report on their card through `update_card`; it is only ever Reported

Date: 2026-11-11 · Status: accepted

## Context

STORY-10: the user sees a story agent's progress on its card live, without trusting it as proof. Evidence states
(ADR 0004) already separate what an agent says (Reported) from what CI, the linked tests and the user show.

## Decision

- **One method, `card.update`**, on the agent socket (MCP tool `update_card`): `{card?, stage?, tasks?, addTasks?,
  criteria?: [{criterion, evidence?}], note?}`. The rules are pure functions in work-format (`card-report.ts`) that the
  server and the tests import; the server only reads the owner copy, checks evidence files and writes.
- **Who.** The calling chat comes from its secret (ADR 0019), never from the params. A story session updates its own
  card only, only while it is the card's latest session (`sessions.at(-1)`), and only while its worktree is there:
  once the worktree is gone the card is owned elsewhere, so the report is refused. A Dev Lead, the chat that drafted
  the feature (`draftedBy`) or the chat the story session nests under (it spawned it), updates stories and bugs of its
  feature once the draft is approved. Any other chat is refused in one sentence. (Spec correction, Dev Lead,
  2026-11-11: the spawning Dev Lead is in scope, not only the drafter.)
- **Why not an unapproved draft.** A report on a story of a draft feature is refused: `addTasks` would change the
  card's content key, so the next `draft_cards` would see a user edit and refuse to revise the draft.
- **What.** A stage forward, up to the last stage before Done (Acceptance by default); never Done, Cancelled, an unknown
  stage, backwards, or any stage after the ceiling (a project's `Done, Reopened`). A card already Done, Cancelled or
  past the ceiling takes no report at all. Ticks by text (case and spacing don't matter), never unticks; tasks added;
  one short note line, signed with the session's name; evidence on a criterion (the same criterion that was ticked,
  when two read alike). Nothing else on the card can be changed.
- **Where.** The owner copy (ADR 0002/0017), through the shared card lane. Nothing is committed: the agent commits the
  card with its work.
- **History.** A stage move is a `status` event; every other change in a call is one `report` event
  (`HISTORY_FIELDS` gains `report`), all `by: session:<chat>`. A `report` event records the delta only (`from` is
  empty, `to` is JSON of the ticked texts, the added texts, the note and the evidence paths), never a snapshot of the
  card, so a card's size grows linearly with its reports. `evidenceState.reported` is the latest claim by a
  session: a `status` move that is not the card's creation, or a `report`. A user's later move ends it. A card an agent
  merely drafted is therefore not Reported. Work rows carry `reported`, shown as "Reported".
- **Evidence.** A file in `.featra/evidence/FEAT-N/STORY-M/` of the owner copy, at most 1 MB, one link per criterion
  (`(evidence: path)` on the criterion line); the path is checked as text (no `..`, absolute, backslash or dot parts) and
  on disk: every part is a real directory entry by exactly that name (case and trailing dots), the file is plain, and
  its real path is inside both the owner copy and the evidence folder, so a link or junction that leads out is refused.
  The size check is advisory: the file can change between the check and the commit (TOCTOU).
  A bug with no parent feature has no evidence folder, so it can't link evidence. The card links the folder in its `evidence` field. The tool's description says to keep it small.

## Consequences

- An agent can never make a story Verified, Proven or Accepted by calling this tool.
- Showing a criterion's evidence link in the card pane, and linking tests to criteria from an agent, are not part of it
  (both are on the roadmap).
- Refusals an agent reads say what the agent can do ("STORY-7 has no working copy yet. Start it with spawn_session."),
  not what a user would do; the card pane keeps its own "Check out ..." message.
