---
id: BUG-39
type: bug
title: A vitest wait keeps its own 1 s deadline under load
status: New
parent: null
order: 0
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-69-review-screen
pr: null
created: 2026-11-23T19:30:00Z
history:
  - at: 2026-11-23T19:30:00Z
    field: status
    from: null
    to: New
    by: session:story-69
---

## Description

`packages/server/test/story-acceptance.test.ts` "two actions at once on one story > refuses a Send back whose session
was still opening when Accept landed: nothing sent" failed in the STORY-69 pre-commit gate and in two loaded local
runs on Windows (2026-11-23), and passed alone each time:

```
AssertionError: expected [] to deeply equal [ 'chat-1' ]
 ❯ test/story-acceptance.test.ts:265:43
    265|     await vi.waitFor(() => expect(opened).toEqual(["chat-1"]));
```

Cause: `vi.waitFor` (and `vi.waitUntil`) keep vitest's own 1 s default. The hang guard (BUG-28) sets the limit of
tests, hooks, `expect.poll` and Testing Library's waits, but not these, and `wait-report-setup.ts` already says so. Send
back scans the repository with real git before it opens the session, and under the full gate that takes more than 1 s.
The BUG-28 wait scan flagged `vi.waitFor` only when it was given a time, so a bare one went unseen. It was the only one
in the unit tests. This is the test's wait, not a product bug.

## Acceptance criteria

- [x] The wait scan finds a `vi.waitFor` or `vi.waitUntil` left at its 1 s default, and the repository has none (test: tooling/test/test-waits.test.ts::no unit test relies on a fixed wall-clock wait (BUG-28) > finds vitest's own waits left at their 1 s default, which the hang guard doesn't reach (BUG-39); tooling/test/test-waits.test.ts::no unit test relies on a fixed wall-clock wait (BUG-28) > finds none in the unit tests, outside the waits allowed for their reason)
- [x] The Send back test waits on the session opening with `until`, its assertion unchanged (test: packages/server/test/story-acceptance.test.ts::two actions at once on one story > refuses a Send back whose session was still opening when Accept landed: nothing sent)

## Tasks

- [x] Find the cause and record it
- [x] Extend the wait scan; it failed on story-acceptance.test.ts:265 before the fix
- [x] Wait with `until` instead

## Notes

- Found and fixed by STORY-69 on its branch. The repo-wide scan test failed on the bare `vi.waitFor` before the change
  to the test, and passes after.
