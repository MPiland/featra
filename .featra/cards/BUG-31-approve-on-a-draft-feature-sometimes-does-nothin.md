---
id: BUG-31
type: bug
title: Approve on a draft feature sometimes does nothing
status: In Review
parent: null
order: 0
origin: bug
role: null
agent: null
model: null
reasoning: null
sessions: []
branch: claude/bug-31-approve-noop
pr: https://github.com/MPiland/featra/pull/73
created: 2026-11-18T20:39:26Z
history:
  - at: 2026-11-18T20:39:26Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-18T21:05:00Z
    field: status
    from: New
    to: In Progress
    by: dev
  - at: 2026-11-18T21:16:42Z
    field: status
    from: In Progress
    to: In Review
    by: dev
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

- [x] Approve always either commits the draft (card Approved, its files committed on the feature branch per the app's rules) or shows an error (test: packages/server/test/draft-review-locked.test.ts::approving while another git holds the index lock (BUG-31) > waits for the lock and commits the draft once it is free, packages/server/test/draft-review-locked.test.ts::approving while another git holds the index lock (BUG-31) > fails in one line when the lock stays, puts the draft back, and logs git's own words, packages/server/test/draft-review-locked.test.ts::an approve whose git add stages some paths and then fails (BUG-31) > still unstages what it staged, puts the draft back, and says why in git's words, packages/server/test/git-run-patient.test.ts::running git patiently (BUG-31) > tries again while the lock is held, in a git that speaks German too, and returns what worked, packages/server/test/git-run-patient.test.ts::running git patiently (BUG-31) > doesn't try again when only a hook's own git was locked out, so the hooks don't run twice, packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > keeps both buttons off while it still runs after the draft comes back, then shows the failure, apps/desktop/e2e/approve-reject.spec.ts::Approve commits the draft's cards to main without pushing and takes the buttons away; Reject deletes another draft's files)
- [x] A failed approve is never silent (test: packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > keeps both buttons off while it still runs after the draft comes back, then shows the failure, packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > shows the failure in the pane even when the card is still not a draft when it comes, and focuses it, packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > puts the failure away once the card is edited, packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > puts the failure away once the draft is sent back, packages/server/test/draft-review-locked.test.ts::approving while another git holds the index lock (BUG-31) > fails in one line when the lock stays, puts the draft back, and logs git's own words)
- [x] The e2e harness keeps the app's log (userData/logs) for a failed test, beside BUG-30's screenshot and trace, and docs/testing.md says so (test: apps/desktop/e2e/failure-evidence.spec.ts::BUG-31: a test stopped while the app runs keeps the app's log, with the main process's and the server's lines, apps/desktop/e2e/failure-evidence.spec.ts::BUG-30: a test stopped while the app waits keeps a screenshot of its window and its trace with DOM snapshots, apps/desktop/e2e/evidence-run.spec.ts::BUG-30: a test that times out on a missing locator prints where it stopped and the files it kept, apps/desktop/test/e2e-harness.test.ts::e2e harness: what a failed test leaves behind (BUG-30) > says in docs/testing.md that the app's log is kept too, and where (BUG-31))
- [x] Regression tests reproduce the race and fail before the fix (test: packages/server/test/draft-review-locked.test.ts::approving while another git holds the index lock (BUG-31) > waits for the lock and commits the draft once it is free, packages/server/test/draft-review-locked.test.ts::approving while another git holds the index lock (BUG-31) > fails in one line when the lock stays, puts the draft back, and logs git's own words, packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > keeps both buttons off while it still runs after the draft comes back, then shows the failure, packages/client/test/components/draft-review-race.test.tsx::an approve the card changes under while it runs (BUG-31) > shows the failure in the pane even when the card is still not a draft when it comes, and focuses it, packages/server/test/draft-review-locked.test.ts::an approve whose git add stages some paths and then fails (BUG-31) > still unstages what it staged, puts the draft back, and says why in git's words)

## Tasks

## Notes

Filed by the dev lead from CI evidence on PR #70 and PR #72; the user asked for it to be fixed now.

Cause and fix: decisions.md, "2026-11-18 — BUG-31 fix".
