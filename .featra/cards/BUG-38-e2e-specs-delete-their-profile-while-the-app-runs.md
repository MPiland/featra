---
id: BUG-38
type: bug
title: E2E specs delete their profile while the app runs
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
created: 2026-11-22T00:00:00Z
history:
  - at: 2026-11-22T00:00:00Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

When an e2e spec fails, its `finally` deletes the test profile while the app is still running. On Windows this hides
the real error behind a 60 s timeout, and it deletes the app's log, so the run keeps no `electron-N-logs`.

Seen in STORY-68's accept run (44843791866). `settings.spec.ts:84` failed in 7 ms on an ENOENT read. CI reported a 60 s
timeout instead, and there was no app log to read. Only the Playwright trace showed the real cause, which was fixed in
PR #80. The known "settings.spec 60 s" flake may have been this same pattern.

## Acceptance criteria

- [ ] A failing e2e spec reports its first error, not a later teardown timeout.
- [ ] The app's log of a failed spec is kept in the CI artifacts.
- [ ] The profile is removed only after the app has closed, or is left for CI to clean up.

## Tasks

- [ ] Find every spec that deletes its profile in `finally` while the app may still run
- [ ] Close the app before removing the profile, in one shared helper
- [ ] Add a regression check that a failed spec keeps its log

## Notes

- Found by the STORY-68 developer while fixing the settings.spec race (PR #80, 2026-11-21).
