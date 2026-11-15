---
id: BUG-23
type: bug
title: Story PR not opened when a scan catches the card mid-write
status: In Progress
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-23-prs-read-flake
pr: null
created: 2026-11-15T17:00:00Z
history:
  - at: 2026-11-15T17:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-15T17:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-23
---

## Description

The server test "never keeps Verified for a commit the PR doesn't have yet: a new commit needs its own passing checks"
failed once in the PR #56 gate (run 43735036438, Ubuntu) with `expected null to be 'https://github.com/acme/app/pull/1'`
right after the story moved into review. It passed on a rerun. The product has a race: a move into review can be missed,
so the story's PR is never opened (or its branch never pushed again).

## Acceptance criteria

- [x] A story moving into review gets its PR opened even when a scan caught its card mid-write on the way (test: packages/server/test/story-prs-open.test.ts::a story moving into review (AC2) > opens it when a scan caught the card mid-write on its way into review (BUG-23))
- [x] A story with a PR coming back into review has its branch pushed again even when a scan caught its card mid-write on the way (test: packages/server/test/story-prs-open.test.ts::a story moving into review (AC2) > pushes again when a scan caught the card mid-write on its way back into review (BUG-23))

## Tasks

- [x] Make the race happen every time: the harness empties the card and scans before writing its new text (`moveCaughtMidWrite`)
- [x] Regression tests, failing before the fix
- [x] Tell a move into review from the last scan that had the story, not only the scan before

## Notes

Cause: a write empties the card file before it writes the new text. The project's watch is debounced and runs its scans
on a timer (file events, and a scan that started new file watchers, queue one 50 ms later; BUG-12), so a scan in the
same process can read the card in between. That scan can't read the card and leaves the story out. Story PRs (`story-prs.ts`) told a move into review
from the scan just before, so on the next scan the story looked new (`!was`) and nothing opened. The failed CI run took
353 ms where it passes in about 1 s: no push and no `gh` call were made, which fits a PR that never started opening.

The harness was not at fault: `move` and `moveOn` already wait for every PR open in flight (`prs.idle()`), so the card
is never read before an open that started has written its link. No test's read was changed.

Fix: each project keeps every story as last seen, and a move into review is told from that, so a scan that left the
story out doesn't count as the story leaving. A story never seen before that arrives in review is still left alone.
