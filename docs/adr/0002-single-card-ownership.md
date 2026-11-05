# 0002 — Single card ownership, history inside the card

Date: 2026-11-04 · Status: accepted

## Context
Cards are markdown files committed with the code, and each story is built in its own worktree off a feature branch. The
same card therefore exists in several branches at once. "Show the freshest copy" is not a rule: copies can conflict,
and git history loses status changes that were never committed.

## Decision
Each card has exactly one owning location at a time:

| Card | Owner |
|---|---|
| Draft or backlog | main |
| Active feature | its feature branch |
| Active story | its worktree |
| Story after merge | the feature branch |
| Anything after feature merge | main |

The app and the MCP write only to the owner; only the owner's copy is shown; edits to a stale copy are flagged, never
silently merged. Every status or scope change appends an event to the card's `history[]`, written at the owner. Charts
read `history[]`, not commit timing. The server allocates IDs.

## Consequences
Ownership is a pure function in `work-format`, testable across every branch state. Burn-up survives uncommitted work.
A user hand-editing a stale copy sees a flag instead of a silent overwrite.
