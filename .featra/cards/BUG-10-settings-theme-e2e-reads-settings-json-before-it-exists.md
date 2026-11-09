---
id: BUG-10
type: bug
title: Settings theme e2e reads settings.json before it exists
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
created: 2026-11-09T14:10:00Z
history:
  - at: 2026-11-09T14:10:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
---

## Description

`apps/desktop/e2e/settings.spec.ts:35` "keyboard only: Ctrl+, opens Settings, the theme changes from the keyboard and
survives a restart (AC4, AC5, AC8)" failed once on E2E (Ubuntu) in CI run 42628722166 (PR #8, STORY-21, head
4fe9e49), after 765 ms:

```
Error: ENOENT: no such file or directory, open '/tmp/featra-e2e-P4BGfI/settings.json'
  at readSettings (e2e/settings.spec.ts:11:56)
  at e2e/settings.spec.ts:54:38
```

Line 54 is `await expect.poll(async () => (await readSettings(profile.dir)).theme).toBe("dark")`. The page had
already shown Dark, but the settings file wasn't written yet, and the read threw instead of being polled again. Windows
and the Gate passed in the same run. STORY-21 doesn't change this test or the settings code.

## Acceptance criteria

- [ ] The cause is found and recorded in Notes: whether `expect.poll` stops on a thrown error, or the app writes the
  file late. If the product is wrong, a regression test fails before the fix.
- [ ] The test passes 20 runs in a row on E2E (Ubuntu), with its assertions unchanged.

## Tasks

- [ ] Find why the poll gave up on the first ENOENT
- [ ] Fix the cause without weakening the test

## Notes

- Found by the Dev Lead while reviewing PR #8. Pre-existing; not caused by STORY-21.
- Second sighting: E2E (Windows), CI run 42630439092 (PR #8 head 766f1a3, a card-only commit), the same test hit
  the 60 s test timeout. Ubuntu passed in that run.
