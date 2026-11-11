---
id: BUG-16
type: bug
title: Update-card journey flakes on Windows
status: In Review
parent: FEAT-5
order: 8
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-16-update-card-e2e-flake
pr: PRURL
created: 2026-11-11T20:10:00Z
history:
  - at: 2026-11-11T20:10:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T20:30:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-16
  - at: 2026-11-11T21:10:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-16
---

## Description

`apps/desktop/e2e/update-card.spec.ts` failed once on E2E (Windows) in CI run 43090311019 (PR #30): the story row
stayed "In Progress" and never showed "Reported" at `expect(row).toContainText("Reported")`. The same code passed on
Windows one run earlier in 5.6 s, and a rerun passed. The update from the story agent's `update_card` call did not reach
the row within the expect timeout.

## Acceptance criteria

- [x] The cause is found and recorded: a slow step the journey has to wait for, or the update being lost or late in the
      product.
- [x] If the product loses or delays the update, it is fixed, and a regression test that fails on the old code proves it.
- [x] The journey passes reliably on Windows CI without weakening, deleting or reordering its assertions.

## Tasks

- [x] Trace the update path: fake SDK, MCP, `card.update`, owner write, scan, Work row
- [x] Regression test `write-atomic-busy.test.ts`, failing on the old code
- [x] Retry a busy rename in `writeAtomic` (shared `busy-retry.ts`, also used by the log writer)
- [x] Rerun E2E (Windows) on the PR

## Notes
- 2026-11-11 (session:bug-16): the failing log shows the row went "StartNew", then "Session Stop In Progress", then
  "Session In Progress" with no Stop: the story's turn ended inside the 5 s wait, yet the card never changed. So the
  update was lost, not slow (a slow MCP start keeps Stop on). The trace was not opened.
- Traced: fake SDK `reportTurn`, real MCP `update_card`, agent socket `card.update`, `card-report.ts`, `writeAtomic`
  (temp file, then `rename` over the card), rescan, Work row. Nothing in the scan, lane or watcher orders it wrong: the
  worktree card is written before the agent starts, and the report's own rescan reaches every listener without a file
  event. The one step that can fail on Windows alone is the rename: a scan that the temp file's own event starts, or
  Defender, holds the card open, and `rename` fails with EPERM or EBUSY. `writeAtomic` gave up at once, so the agent got
  "Can't save the card" and its turn ended. The log writer already retries that (decisions.md, STORY-47); the card
  writes did not. This is the likely cause by elimination, not seen in a trace.
- Fix: `writeAtomic` tries a busy rename again (five tries, 25 ms steps) through `busy-retry.ts`, shared with the log
  writer. It covers every card write (report, pane edit, spawn, stop, drafts). Regression test
  `packages/server/test/write-atomic-busy.test.ts` (fakes only the rename) failed on the old code and passes now. The
  journey is unchanged.
