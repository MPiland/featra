---
id: BUG-9
type: bug
title: ws-work tests fail when a git commit in the temp repo fails
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
created: 2026-11-09T02:40:36Z
history:
  - at: 2026-11-09T02:40:36Z
    field: status
    from: null
    to: New
    by: session:bug-4
---

## Description

In the BUG-6 session's pre-commit run on 2026-11-09, around 02:30Z (Windows, full `pnpm test:unit`), 3 tests in `packages/server/test/ws-work.test.ts` failed because a `git commit` inside the test's temporary repo failed. The captured output doesn't say why. A retry with no code change passed. This is the first sighting.

Not traced to the feature in progress, so this is on the project bug list.

## Acceptance criteria

- [ ] The failure is reproduced with git's stderr captured, and its cause is recorded in Notes. If the cause is a product bug, a regression test fails before the fix.
- [ ] The fix is proven by a CI soak of the unit suite (`soak/<platform>/unit/<runs>`) with no failure, with the tests' assertions unchanged. The run id and result are recorded in Notes.

## Tasks

- [ ] Make the test's git calls report git's stderr when they fail
- [ ] Reproduce under the full unit run and record the cause
- [ ] Fix the cause without weakening the tests

## Notes

- Reported by the BUG-6 session; recorded by session:bug-4. Only the failing run's summary was kept, so the three test names and git's error aren't known yet.
