---
id: BUG-35
type: bug
title: Send back race test misses its 1 s wait under load
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
created: 2026-11-19T09:45:00Z
history:
  - at: 2026-11-19T09:45:00Z
    field: status
    from: null
    to: New
    by: session:story-65
---

## Description

`packages/server/test/story-acceptance.test.ts` "two actions at once on one story > refuses a Send back whose session
was still opening when Accept landed: nothing sent" failed 2 of 3 local pre-commit gates during STORY-65 on Windows
(2026-11-19), each time in a full `pnpm test:unit` run that took about 20 minutes. Both times it failed the same way,
after about 1.5 s:

```
AssertionError: expected [] to deeply equal [ 'chat-1' ]
 ❯ test/story-acceptance.test.ts:265:43
    265|     await vi.waitFor(() => expect(opened).toEqual(["chat-1"]));
```

It passes alone (3 s for the file) and passed in the gate in between. The commits only changed
`apps/desktop/package.json` and a desktop test, which this test doesn't read.

Likely cause: `sendBack` (`packages/server/src/story-acceptance.ts`) scans the repository, a real git repo, before it
opens the story's session. `vi.waitFor` waits 1 s by default, and under full-suite load the scan's git processes can
take longer than that, so the wait gives up before `open` is called. If so, this is the test's wait, not a product bug.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes. If it is a product bug, a regression test fails before the fix.
- [ ] The test passes 50 full `pnpm test:unit` runs in a row on Windows, with its assertions unchanged.

## Tasks

- [ ] Confirm the time `sendBack` takes to reach `open` under load
- [ ] Fix the cause without weakening the test (for example, wait on `open` being called rather than a fixed 1 s)

## Notes

- Found by STORY-65 (PR #76). Gate logs from the two failures are in the STORY-65 session's scratchpad (s65-commit4,
  s65-commit6).
- Failed again in 2 of 2 full local `pnpm check` runs during STORY-66 (2026-11-19, Windows), with the same assertion at
  line 265, and passed when run alone. See BUG-37 for the merge request test that failed in the same runs.
