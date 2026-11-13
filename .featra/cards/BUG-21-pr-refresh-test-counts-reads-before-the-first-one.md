---
id: BUG-21
type: bug
title: PR refresh test counts reads before the first one is made
status: Done
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-pr-refresh-flake
pr: null
created: 2026-11-13T16:00:00Z
history:
  - at: 2026-11-13T16:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
  - at: 2026-11-13T16:00:00Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
  - at: 2026-11-13T16:30:00Z
    field: status
    from: In Progress
    to: Acceptance
    by: dev-lead
  - at: 2026-11-13T18:32:35Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-13T18:32:35Z
    field: status
    from: Acceptance
    to: Done
    by: user
---

## Description

The server test "re-reads open PRs on prs.refresh, after the focus settles" fails now and then in CI with
`expected 2 to be 1`. It failed the FEAT-6 PR's gate once. The product is fine; the test's wait is too loose.

## Acceptance criteria

- [x] The test counts the first PR read before it asks for a refresh, even when `gh pr view` is slow to start (test: packages/server/test/story-prs-api.test.ts::Create PR and the PR chip's data (AC2, AC3, AC4) > re-reads open PRs on prs.refresh, after the focus settles)

## Tasks

- [x] Make the race happen every time: a fake `gh pr view` that is slow to start (`viewStartDelayMs`)
- [x] Regression check, failing before the fix: the first read is counted before the refresh
- [x] Wait for both pollers to settle, not for any timer

## Notes

Cause: the test waited for `timersSet() > 0` to know the first read was done. Since STORY-14, the features' PR poller
shares the same timers, so its timer could satisfy the wait before the story's first `gh pr view` was made. The count
taken then was 0, and the first read and the refresh's read together made 2 where 1 was expected.

Fix: the test waits until the story's PR reads as open and both pollers' timers are set (2), and checks the count is 1
before the refresh. After the refresh it waits for both timers again before moving the clock.

Follow-up in PR #50: only the first read is slow to start. With every read slow to start, the test ran past its
timeouts on a loaded machine (a local gate).
