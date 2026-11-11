---
id: STORY-10
type: story
title: Agents update their own card
status: In Review
parent: FEAT-5
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-10-agent-card
pr: "29"
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-11T10:00:00Z
    field: status
    from: New
    to: In Progress
    by: developer
  - at: 2026-11-11T14:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: developer
---

## Description

As the user, I see a story agent's progress on its card live, marked Reported, without trusting it as proof.

## Acceptance criteria

- [x] `update_card` lets a story session move its stage up to Acceptance, tick and add tasks, tick ACs, append notes and link evidence; Done and any other status are refused (test: packages/server/test/agent-card-update.test.ts::AC1: what a story session may write > moves its stage up to Acceptance, and no further; packages/server/test/agent-card-update.test.ts::AC1: what a story session may write > refuses %s, and the card stays as it was; packages/server/test/agent-card-update.test.ts::AC1: what a story session may write > ticks tasks and criteria, adds tasks, appends a note, and links evidence; packages/mcp/test/update-card.test.ts::update_card through the Featra MCP > updates the story session's own card in its worktree, and says what changed: Reported, not committed; packages/work-format/test/card-report.test.ts: the stage, ticks, notes and input rules)
- [x] Writes go to the owner copy (the worktree), append a history event `by: session:<id>`, and show on the feature list live, marked Reported (test: packages/server/test/agent-card-update.test.ts::AC2: the owner copy, history, and the feature list > writes only to the worktree: the feature branch and main keep the card as committed; packages/server/test/agent-card-update.test.ts::AC2: the owner copy, history, and the feature list > appends history events by session:<id>, and the card is Reported, nothing more; packages/server/test/agent-card-update.test.ts::AC2: the owner copy, history, and the feature list > shows on the Work list at once, marked Reported, and pushes it to a watcher; packages/client/test/components/work-reported.test.tsx::the Reported mark > marks a story an agent reported on; packages/work-format/test/evidence.test.ts and work-list.test.ts: the Reported rules; e2e, run in CI only: apps/desktop/e2e/update-card.spec.ts)
- [x] A story session can update only its own card; the Dev Lead can update cards in its feature; any other chat is refused (test: packages/server/test/agent-card-update.test.ts::AC3: whose card > refuses a story session any card but its own, in one sentence, and writes nothing; packages/server/test/agent-card-update.test.ts::AC3: whose card > lets the Dev Lead of the feature update a story in it, by its own session; packages/server/test/agent-card-update.test.ts::AC3: whose card > refuses any other chat, and says which card to name when a Dev Lead leaves it out; packages/server/test/agent-card-update-review.test.ts::whose card: the Dev Lead scope; packages/mcp/test/update-card.test.ts::update_card through the Featra MCP > lets the Dev Lead that spawned the story session update its card; packages/mcp/test/update-card.test.ts::update_card through the Featra MCP > refuses a chat that neither spawned the session nor drafted the feature)
- [x] Evidence lives in `.featra/evidence/FEAT-N/STORY-M/` and is committed with the story, kept as small as the story allows; an AC's evidence link must point inside that folder, and the card links the folder (test: packages/server/test/agent-card-update.test.ts::AC4: evidence > refuses %s; packages/server/test/agent-card-update.test.ts::AC4: evidence > refuses a file that isn't there, a folder, and one that is too big; packages/server/test/agent-card-update.test.ts::AC4: evidence > links the folder from the card, and the evidence is in the story's own folder; packages/mcp/test/update-card.test.ts::update_card through the Featra MCP > is listed with a description that teaches the stages, the claim, the limits and the evidence folder; packages/work-format/test/card-report.test.ts::evidence; packages/server/test/agent-card-update-review.test.ts::evidence that leads out of its folder)

## Tasks

- [x] Pure rules in work-format: stage ceiling, who may update, input limits, ticks, notes, evidence path, the report event (test: packages/work-format/test/card-report.test.ts)
- [x] Reported counts a session's report, not a card's creation; the Work row carries it (test: packages/work-format/test/evidence.test.ts, work-list.test.ts)
- [x] Card format: an AC's evidence link round-trips (test: packages/work-format/test/card-report.test.ts)
- [x] Server: `card.update` on the agent socket, the owner-copy write, and the evidence file checks (test: packages/server/test/agent-card-update.test.ts)
- [x] MCP tool `update_card` whose description teaches the format and the limits (test: packages/mcp/test/update-card.test.ts)
- [x] Reported mark on the story row (test: packages/client/test/components/work-reported.test.tsx)
- [x] ADR 0027 and the Playwright journey (written, run in CI only: apps/desktop/e2e/update-card.spec.ts)

## Notes

- 2026-11-10 (dev-lead): Reshaped with the user: agent edits are scoped to their own card, and evidence goes in a committed per-feature folder (see decisions.md).
- 2026-11-11 (developer): Built `update_card` (ADR 0027). Everything an agent writes is Reported, never Verified, Proven or Accepted. `evidenceState.reported` no longer counts a card's creation. The card pane does not show an AC's evidence link yet. Choices for the Dev Lead to confirm are in decisions.md.
- 2026-11-11 (developer): Review fixes: a story session logs to its worktree; closed and past-ceiling cards take no report; `report` events keep the delta only; the Dev Lead scope includes the spawning chat; only the latest session updates; evidence links are checked by real path. Roadmap: the evidence link in the card pane, agents linking tests.
