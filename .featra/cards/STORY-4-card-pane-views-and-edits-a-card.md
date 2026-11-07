---
id: STORY-4
type: story
title: Card pane views and edits a card
status: In Review
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
  - at: 2026-11-07T07:45:00Z
    field: status
    from: In Progress
    to: In Review
    by: user
  - at: 2026-11-07T08:30:00Z
    field: status
    from: In Review
    to: In Progress
    by: user
  - at: 2026-11-07T09:10:00Z
    field: status
    from: In Progress
    to: In Review
    by: user
---

## Description

As a builder, I open a story in a full-height pane beside the list and edit its text in place.

## Acceptance criteria

- [x] Clicking a story opens a full-height docked card pane (never a floating popover); the list stays visible and the pane can be closed (test: packages/client/test/components/card-pane.test.tsx AC1, apps/desktop/e2e/card-pane.spec.ts)
- [x] The pane shows the user story, evidence, acceptance criteria with their proof, tasks, notes and PR (test: packages/client/test/components/card-pane.test.tsx AC2, packages/work-format/test/card-view.test.ts, apps/desktop/e2e/card-pane.spec.ts)
- [x] Clicking the user story or another text field edits it in place; leaving the field saves to the owner copy, and Escape cancels (test: packages/client/test/components/card-pane.test.tsx AC3, packages/server/test/card-actions.test.ts, packages/work-format/test/card-edit.test.ts, apps/desktop/e2e/card-pane.spec.ts)
- [x] Status and parent changes append a history event (test: packages/client/test/components/card-pane.test.tsx AC4, packages/server/test/card-actions.test.ts, packages/work-format/test/card-edit.test.ts, apps/desktop/e2e/card-pane.spec.ts)
- [x] The pane can be resized by dragging its edge, or with the keyboard on the handle; the list and the pane keep a minimum width and the width is remembered (test: packages/client/test/pane-width.test.ts, packages/client/test/components/card-pane.test.tsx AC5, packages/client/test/bridge.test.ts, apps/desktop/test/ui-state-store.test.ts, apps/desktop/e2e/card-pane.spec.ts)
- [x] At any window size down to the app's minimum, nothing scrolls sideways and the close button is visible (test: packages/client/test/pane-width.test.ts, packages/client/test/components/card-pane.test.tsx AC6, apps/desktop/e2e/card-pane.spec.ts)

## Tasks

- [x] work-format: `card-view-types.ts` (client-safe shapes, `@featra/work-format/card-view`), `card-edit.ts` (one-field edits with the `from` check, status and parent choices from the rules), `card-view.ts` (the pane's view, read-only reasons); `card.watch`, `card.update` and the `card.view` push in `ServerMethods`
- [x] Server: `card-actions.ts` (fresh scan, write to the owner copy only, atomic temp-file-then-rename, rescan through the watches); `observe` in `work-watch.ts` with per-listener dedupe; the API cases
- [x] Client: `CardPane` + `CardSections` + `useCard`, the `InlineText` control, story titles open the pane (`card-selection.tsx`), the list and pane side by side (`styles/card-pane.css`), the card bridge (`card-pane.ts`)
- [x] Tests: work-format unit tests, server tests on real git (worktree-owned write, `from` mismatch, read-only owner), a socket test, client component tests over a fake server that edits with work-format, the e2e `apps/desktop/e2e/card-pane.spec.ts`
- [x] Docs: ADR 0017, ADR 0015 method table, architecture.md, CONTEXT.md (Card pane)
- [x] Sizing (sent back): `pane-width.ts` (default, limits, keys, stored value), the `PaneHandle` separator, `cardPaneWidth` in the UI state, the pane fitted inline and nothing inside it able to widen it; ADR 0017 Width

## Notes

- Built per the Dev Lead's notes: writes are atomic (a temp file in the same folder, then a rename) and the
  watch's per-listener dedupe keeps the pane from flashing back; keyboard flow (Enter opens and focuses the pane,
  Escape closes back to the row, fields reachable with Tab and edited on Enter); status choices come only from the
  transition rules (no Done before Verified and Accepted; Accept and Send back are a later story); a field being
  edited ignores pushes, and a refused save keeps the typed text and shows the value now.
- Limits (ADR 0017): a parent change that changes the owner is written to the old owner, and the next scan resolves
  the new one; ticking, adding or removing ACs and tasks isn't a pane edit yet.
- A unit test expected Done among a feature's status choices; the rules rightly exclude it while one of its stories
  is open, so the expectation was corrected (not the code).
- Tests: `pnpm check` passes (612 unit/integration tests). Windows e2e 35/35, including `card-pane.spec.ts`;
  `tray.spec.ts --repeat-each=5` 45/45. Not run: the e2e on WSLg.
- Sent back by the user (2026-11-07): "Pane isn't properly sized when not full screen. You can see the horizontal
  scroll bar, the "x" to close is hidden, and I can't resize the pane." In a window of about 1300 px the pane took
  nearly the whole width: a long AC test path didn't truncate and pushed it out. AC5 and AC6 added.
- Sizing fix: before it, the new e2e failed at 1280×800 with the work area scrolling sideways by 390 px
  (`main` and `.work-split`); after it, `pnpm check` passes (624 tests), Windows e2e 36/36, `tray.spec.ts
  --repeat-each=5` 45/45. Three UI-state fixtures gained the new `cardPaneWidth` field. Not run: the e2e on WSLg.
- WSLg review: the sizing e2e failed in 2 of 9 full-suite runs, with the page at 1280×820 (the window's default)
  instead of 800: a resize made right after launch, before the window was first shown, was lost when the window
  was mapped. `sizeTo` now waits for the window to be shown, out of full screen and not maximized, then asks again
  until the content size and the page hold (5 tries), and fails naming the size it got. The AC checks are unchanged.
