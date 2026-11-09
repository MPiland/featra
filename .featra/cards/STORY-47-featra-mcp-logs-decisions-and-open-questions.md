---
id: STORY-47
type: story
title: Featra MCP logs decisions and open questions
status: In Progress
parent: FEAT-3
order: 7
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-47-mcp
pr: null
created: 2026-11-08T22:00:00Z
history:
  - at: 2026-11-08T22:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T20:38:30Z
    field: status
    from: New
    to: In Progress
    by: session:story-47
---

## Description

As a builder, I want agents to record the decisions we make, and why, without my asking, so a later agent or I can
see what was decided and the reasons behind it.

## Acceptance criteria

- [x] Every session gets the Featra MCP server (`packages/mcp`, stdio) unless it is turned off in Settings â€º Project;
  when it's off, the tools aren't offered (test: packages/server/test/agent-mcp.test.ts > AC1 (starts the Claude session with the stdio server and its tools allowed; offers no tools when the setting is off; offers none without a bundled MCP, or before the server listens; each chat's own secret); packages/server/test/ws-chat-log.test.ts > AC1 (on with no setting, off when the project says so; app default and project override); packages/client/test/components/settings/ProjectMcp.test.tsx > AC1; packages/work-format/test/knowledge-log.test.ts > whether a project's agents get the MCP; packages/mcp/test/stdio.test.ts > offers log_decision and defer_question; apps/desktop/e2e/chat-log.spec.ts journeys)
- [x] `log_decision` appends a dated entry to `decisions.md` with the decision, why it was made, the alternatives
  rejected, and the session and card (test: packages/mcp/test/stdio.test.ts > log_decision appends a dated entry to decisions.md with why, rejected, session and card; packages/server/test/log-writer.test.ts > appending an entry (a missing file created, concurrent appends, a failed write); packages/work-format/test/knowledge-log.test.ts > the entry; packages/server/test/ws-chat-log.test.ts > runs the whole way over the sockets and the disk; apps/desktop/e2e/chat-log.spec.ts journey)
- [x] `defer_question` appends the question and its context, with the session and card, to `open-questions.md` (test: packages/mcp/test/stdio.test.ts > defer_question appends the question and its context to open-questions.md; packages/server/test/log-writer.test.ts > puts a question and its context in open-questions.md, not decisions.md; packages/work-format/test/knowledge-log.test.ts > the entry)
- [x] The tools' descriptions teach when to log: a choice that changes behavior or scope, a public contract, stored
  data or security, or that picks between real trade-offs. Trivia is not logged (test: packages/mcp/test/stdio.test.ts > offers log_decision and defer_question, with the descriptions that teach when to log; refuses a bad input as a tool error, writing nothing; packages/work-format/test/knowledge-log.test.ts > what the tools take)
- [x] The chat shows "Logged to decisions.md" (or open-questions.md) with Undo, which removes exactly that entry (test: packages/client/test/components/chat-log.test.tsx > AC5; packages/server/test/log-writer.test.ts > Undo (only that entry, after later entries, an edited entry refused, an already-removed entry); packages/server/test/agent-mcp.test.ts > shows in the chat as logged, and Undo removes it and shows it undone; packages/server/test/ws-chat-log.test.ts > both tests; apps/desktop/e2e/chat-log.spec.ts journey)

## Tasks

- [x] Pure format: entry parsing, the dated entry with its marker, add and remove (`work-format`)
- [x] Log writer: per-file queue, atomic write, missing file created, Undo ledger (server)
- [x] Agent socket `/v1/agent` with a secret per chat, and the provider-neutral MCP spec (ADR 0019)
- [x] `packages/mcp`: stdio server, tool registry, `log_decision` and `defer_question` with teaching descriptions
- [x] Settings › Project toggle, read by the server each time an agent starts
- [x] Chat row "Logged to ..." with Undo, and `chat.undoLog`
- [x] Bundle `dist/mcp.cjs`, tests (unit, stdio integration, e2e journeys), ADR and decisions

## Notes

- Depends on: STORY-5. FEAT-4's `draft_cards` (STORY-8) is added to this server later.
- Decision 2026-11-08: agents judge what to log, instead of a "Save as decision" box; each entry carries its reasoning.
- Entries are written in the session's working folder, so they're committed with that branch's work.
- The journey test drives the MCP over stdio with a faked SDK; the tool descriptions are real.
