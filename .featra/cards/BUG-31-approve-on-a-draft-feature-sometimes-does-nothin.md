---
id: BUG-31
type: bug
title: Approve on a draft feature sometimes does nothing
status: New
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-18T20:39:26Z
history:
  - at: 2026-11-18T20:39:26Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

In CI end-to-end runs, a click on Approve under a draft feature sometimes lands and then nothing happens. Seen on
macOS on PR #72 (`auto-merge-fails` via `proven-story.ts:78`, `story-notice.spec.ts:27`, `start-feature.spec.ts:27`)
and on Windows on PR #70 (`abandon-story`, `accept-story`).

What the kept evidence shows:

- The click lands. DraftReview's Approve and Reject go disabled for about 130 ms, then come back 100 to 200 ms later.
  No error is shown.
- The card stays Draft. `.featra/cards/FEAT-2-shaping.md`, `STORY-1-*.md` and `STORY-2-*.md` stay untracked for 30 s
  and more. It is not slowness: the commit never happens.

`draft.approve` calls `review.approve` (server `draft-review.ts`), which either commits or throws an `ApiError` that
DraftReview would show. So the result is lost somewhere between them.

Suspected, not proven: DraftReview remounts while the call is in flight (CardPane renders it only when
`view.draftChat && !readOnly`, and the card view refreshes during approve's scan), which drops its busy state and the
result. Underneath, the approve itself is stuck or failed without a word (the card lane queue or git).

## Acceptance criteria

- [ ] Approve always either commits the draft (card Approved, its files committed on the feature branch per the app's rules) or shows an error
- [ ] A failed approve is never silent
- [ ] The e2e harness keeps the app's log (userData/logs) for a failed test, beside BUG-30's screenshot and trace, and docs/testing.md says so
- [ ] Regression tests reproduce the race and fail before the fix

## Tasks

## Notes

Filed by the dev lead from CI evidence on PR #70 and PR #72; the user asked for it to be fixed now.
