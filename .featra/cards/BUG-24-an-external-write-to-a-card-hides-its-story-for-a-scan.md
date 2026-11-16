---
id: BUG-24
type: bug
title: An external write to a card hides its story for a scan
status: Acceptance
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-24-25-scan-resilience
pr: https://github.com/MPiland/featra/pull/58
created: 2026-11-15T20:00:00Z
history:
  - at: 2026-11-15T20:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-15T21:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-24-25
  - at: 2026-11-15T22:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-24-25
  - at: 2026-11-16T00:14:50Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

Featra's own card writes are atomic (`writeAtomic` in `card-actions.ts`, the card lane), but a writer outside Featra (a
session's file tools, an editor, or git) empties a card file before it writes the new text. A watch scan in between
can't parse the owner copy, and the scanner (`work-scan.ts`, `resolve` and `deletedAtOwner`) classes an owner copy that
exists but can't be parsed as deleted at its owner (STORY-58). The story is hidden for that scan although its main and
feature copies exist. Story PRs missed the move into review because of it (BUG-23, fixed there with defense in depth);
story checks clear the check state shown on the card and start a needless run (`story-checks.ts`, about lines
214-226). Also, applying a stale copy writes the owner card with a plain `writeFile`, outside the card lane
(`copy-actions.ts:70`).

## Acceptance criteria

- [x] An empty or unparseable owner copy is never treated as deleted; the story stays shown, with the read problem listed (test: packages/server/test/work-scan-unread.test.ts::an owner copy that can't be read (BUG-24 AC1) > is never taken as deleted when the file is empty: the feature branch's copy shows; packages/server/test/card-writers-owner.test.ts::card writers, while the owner's copy can't be read (BUG-24 review) > records no PR over the owner's file; packages/work-format/test/card-view.test.ts::readOnlyReason > is read-only when the owner's copy can't be read, and says so rather than that it has none (BUG-24))
- [x] The watch rescans once after it settles before telling observers about an unreadable or zero-length card, so a transient one is never published (test: packages/server/test/work-watch-settle.test.ts::a card a writer has just emptied (BUG-24 AC2) > is never published when the write finishes before the rescan)
- [x] Story checks keep their state and don't rerun when a card is briefly unreadable (test: packages/server/test/story-checks-run.test.ts::what a failing run leaves behind > keeps a story's checks, and does not run them again, while its card is briefly unreadable (BUG-24 AC3); packages/server/test/story-checks-run.test.ts::what a failing run leaves behind > keeps a story's checks while its card stays unreadable past the retry, then reads the same (BUG-24 review); packages/server/test/story-prs-open.test.ts::a story moving into review (AC2) > doesn't push again while the card can't be read past the retry, then reads the same (BUG-24 review))
- [x] Applying a stale copy writes the owner card atomically, through the card lane (test: packages/server/test/copy-actions.test.ts::apply, as a card write (BUG-24 AC4) > waits for the card lane before it reads or writes anything)

## Tasks

## Notes

Found in the review of BUG-23 (PR #57).
