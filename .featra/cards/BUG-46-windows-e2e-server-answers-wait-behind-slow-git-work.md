---
id: BUG-46
type: bug
title: Windows e2e server answers wait behind slow git work
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
created: 2026-11-27T14:11:58Z
history:
  - at: 2026-11-27T14:11:58Z
    field: status
    from: null
    to: New
    by: session:bug-40
---

## Description

BUG-40's soaks of E2E (Windows) on PR #93 failed several tests whose page socket opened at once (so not BUG-40). In
each, a server answer the test waits on came after the default 5 s, behind other git work that was slow on the
runner. BUG-44 fixed the first scan's queue; these remain. Times are from the page's socket frames in the app's trace.

Start → feature branch (the BUG-44 kind):

- `ci-proven.spec.ts:58`, run 45968240720 attempt 14, job 140452173354: `draft.approve` took 3.6 s (1,735 to
  5,384 ms). `feature.start`, sent at 2,734 ms, had not made `feature/2-shaping` when the test's poll ended.
- Start branch not made in time: `proof-capture` (run 45888994492 attempt 16, job 140195918477), `work-layout` (attempt
  18, job 140201862119), `story-pr` (attempt 36, job 140250043988), and `proven-story.ts:80` in `auto-merge` (run
  45935606968 attempt 2, job 140300643270).
- Possibly the same, to confirm: `draft-chat.ts:30` in `abandon-story` (run 45935606968 attempt 8, job 140315999087)
  and `update-card.spec.ts:44` (attempt 22, job 140350965846).

Project settings wait behind the first scan:

- `story-pr.spec.ts:47`, run 45968240720 attempt 19, job 140472702177 (BUG-42's line): the "Open story PRs
  automatically" switch wasn't there after 5 s. `proof.load`, sent at 187 ms, answered at 5,257 ms, with the launch's
  first `work.watch` (5.3 s). `chat.list` took 3.1 s.
- `proof-setup.ts:48` in `proof-preview.spec.ts`, run 45888994492 attempt 10, job 140176871438: "Saved" not shown in
  the Proof region after 5 s. `proof.load` answered with the first `work.watch` at 1,651 ms; `checks.load` took 2.4 s.
  The first `proof.set` answered 2.9 s after it was sent and the second not within the wait. The first answer already
  held the second's change.

## Acceptance criteria

- [ ] The cause is found for each test above and recorded in Notes with timings: which server work each answer waits
      behind, and why it is slow on Windows. Tests with another cause are split into their own bugs. A regression test
      fails before each fix.
- [ ] Settings' project loads and saves, and Start, answer within the tests' default wait on E2E (Windows), fixed at
      the cause. No assertion is weakened, deleted or reordered, and no wait is raised.
- [ ] The tests above pass 20 E2E (Windows) runs in a row.

## Tasks

- [ ] Time the server's queue on a Windows runner for each failure from the kept traces
- [ ] Fix the cause without weakening the tests

## Notes

- Found by BUG-40. Kept files: the `e2e-windows-traces` artifacts of runs 45888994492, 45935606968 and 45968240720 for
  the attempts above.
- See BUG-44 (first scan's queue, Start) and BUG-42 (`story-pr.spec.ts:47`, closed by BUG-44).
