---
id: BUG-24
type: bug
title: An external write to a card hides its story for a scan
status: New
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-15T20:00:00Z
history:
  - at: 2026-11-15T20:00:00Z
    field: status
    from: null
    to: New
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

- [ ] An empty or unparseable owner copy is never treated as deleted; the story stays shown, with the read problem listed
- [ ] The watch rescans once after it settles before telling observers about an unreadable or zero-length card, so a transient one is never published
- [ ] Story checks keep their state and don't rerun when a card is briefly unreadable
- [ ] Applying a stale copy writes the owner card atomically, through the card lane

## Tasks

## Notes

Found in the review of BUG-23 (PR #57).
