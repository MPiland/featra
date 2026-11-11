# 0027 — Agents report on their card through `update_card`; it is only ever Reported

Date: 2026-11-11 · Status: accepted

## Context

STORY-10: the user sees a story agent's progress on its card live, without trusting it as proof. Evidence states
(ADR 0004) already separate what an agent says (Reported) from what CI, the linked tests and the user show.

## Decision

- **One method, `card.update`**, on the agent socket (MCP tool `update_card`): `{card?, stage?, tasks?, addTasks?,
  criteria?: [{criterion, evidence?}], note?}`. The rules are pure functions in work-format (`card-report.ts`) that the
  server and the tests import; the server only reads the owner copy, checks evidence files and writes.
- **Who.** The calling chat comes from its secret (ADR 0019). A story session updates its own card only; the Dev Lead
  (`draftedBy` the feature) updates stories and bugs of its feature once the draft is approved. Any other chat is
  refused in one sentence.
- **What.** A stage forward, up to the last stage before Done (Acceptance by default); never Done, Cancelled, an unknown
  stage or backwards. Ticks by exact text, never unticks; tasks added; one short note line; evidence on a criterion.
  Nothing else on the card can be changed.
- **Where.** The owner copy (ADR 0002/0017), through the shared card lane. Nothing is committed: the agent commits the
  card with its work.
- **History.** A stage move is a `status` event; every other change in a call is one `report` event
  (`HISTORY_FIELDS` gains `report`), all `by: session:<chat>`. `evidenceState.reported` is the latest claim by a
  session: a `status` move that is not the card's creation, or a `report`. A user's later move ends it. A card an agent
  merely drafted is therefore not Reported. Work rows carry `reported`, shown as "Reported".
- **Evidence.** A file in `.featra/evidence/FEAT-N/STORY-M/` of the owner copy, at most 1 MB, one link per criterion
  (`(evidence: path)` on the criterion line); the path is checked as text (no `..`, absolute, backslash or dot parts) and
  on disk (a plain file). The card links the folder in its `evidence` field. The tool's description says to keep it small.

## Consequences

- An agent can never make a story Verified, Proven or Accepted by calling this tool.
- Showing a criterion's evidence link in the card pane, and linking tests to criteria from an agent, are not part of it.
