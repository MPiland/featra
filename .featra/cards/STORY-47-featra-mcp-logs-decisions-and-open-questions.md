---
id: STORY-47
type: story
title: Featra MCP logs decisions and open questions
status: New
parent: FEAT-3
order: 7
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-08T22:00:00Z
history:
  - at: 2026-11-08T22:00:00Z
    field: status
    from: null
    to: New
    by: user
---

## Description

As a builder, I want agents to record the decisions we make, and why, without my asking, so a later agent or I can
see what was decided and the reasons behind it.

## Acceptance criteria

- [ ] Every session gets the Featra MCP server (`packages/mcp`, stdio) unless it is turned off in Settings › Project;
  when it's off, the tools aren't offered
- [ ] `log_decision` appends a dated entry to `decisions.md` with the decision, why it was made, the alternatives
  rejected, and the session and card
- [ ] `defer_question` appends the question and its context, with the session and card, to `open-questions.md`
- [ ] The tools' descriptions teach when to log: a choice that changes behavior or scope, a public contract, stored
  data or security, or that picks between real trade-offs. Trivia is not logged
- [ ] The chat shows "Logged to decisions.md" (or open-questions.md) with Undo, which removes exactly that entry

## Tasks

- [ ] Break down when picked up

## Notes

- Depends on: STORY-5. FEAT-4's `draft_cards` (STORY-8) is added to this server later.
- Decision 2026-11-08: agents judge what to log, instead of a "Save as decision" box; each entry carries its reasoning.
- Entries are written in the session's working folder, so they're committed with that branch's work.
- The journey test drives the MCP over stdio with a faked SDK; the tool descriptions are real.
