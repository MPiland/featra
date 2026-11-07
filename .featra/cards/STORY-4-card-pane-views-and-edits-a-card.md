---
id: STORY-4
type: story
title: Card pane views and edits a card
status: In Progress
parent: FEAT-2
order: 3
origin: planned
role: developer
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
    to: New
    by: user
  - at: 2026-11-07T05:12:12.946Z
    field: status
    from: New
    to: In Progress
    by: user
---

## Description

As a builder, I open a story in a full-height pane beside the list and edit its text in place.

## Acceptance criteria

- [ ] Clicking a story opens a full-height docked card pane (never a floating popover); the list stays visible and the pane can be closed
- [ ] The pane shows the user story, evidence, acceptance criteria with their proof, tasks, notes and PR
- [ ] Clicking the user story or another text field edits it in place; leaving the field saves to the owner copy, and Escape cancels
- [ ] Status and parent changes append a history event

## Tasks

- [x] work-format: `card-view-types.ts` (client-safe shapes, `@featra/work-format/card-view`), `card-edit.ts` (one-field edits with the `from` check, status and parent choices from the rules), `card-view.ts` (the pane's view, read-only reasons); `card.watch`, `card.update` and the `card.view` push in `ServerMethods`
- [x] Server: `card-actions.ts` (fresh scan, write to the owner copy only, atomic temp-file-then-rename, rescan through the watches); `observe` in `work-watch.ts` with per-listener dedupe; the API cases
- [x] Client: `CardPane` + `CardSections` + `useCard`, the `InlineText` control, story titles open the pane (`card-selection.tsx`), the list and pane side by side (`styles/card-pane.css`), the card bridge (`card-pane.ts`)
- [x] Tests: work-format unit tests, server tests on real git (worktree-owned write, `from` mismatch, read-only owner), a socket test, client component tests over a fake server that edits with work-format, the e2e `apps/desktop/e2e/card-pane.spec.ts`
- [x] Docs: ADR 0017, ADR 0015 method table, architecture.md, CONTEXT.md (Card pane)

## Notes
