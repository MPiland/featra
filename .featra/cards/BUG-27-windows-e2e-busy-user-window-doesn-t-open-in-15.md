---
id: BUG-27
type: bug
title: Windows e2e busy-user window doesn't open in 15 s
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
created: 2026-11-16T19:26:16Z
history:
  - at: 2026-11-16T19:26:16Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

`apps/desktop/e2e/tray.spec.ts` › "the tray's Show Featra and a tray click restore and focus the window" failed on
Windows CI with "The busy-user window didn't open in 15 s". The error comes from the e2e harness, not the app:
`busyUserInFront` in `apps/desktop/e2e/foreground.ts` starts `busy-user.ps1` in PowerShell and waits 15 s for its
first line (the window's handle and pid), which never came.

Seen in run 43932200612, attempt 1, job E2E (Windows), on PR #64 (STORY-61, commit 2ae6596, which changed only a
card file). The same spec passed on that PR's previous commit (run 43924798575) and in attempts 2 and 3 of the same
run.

## Acceptance criteria

- [ ] The root cause of the busy-user window not answering in 15 s on Windows CI is found and recorded in Notes
- [ ] The tray spec's busy-user setup no longer fails this way, with every assertion unchanged

## Tasks

## Notes

Found by STORY-61's session while watching PR #64's CI. Not fixed there: it is a project bug in the e2e harness,
not caused by FEAT-8. Related: BUG-3 (the foreground helper, Done) and BUG-11 (the user32 helper never answering
ready, New).
