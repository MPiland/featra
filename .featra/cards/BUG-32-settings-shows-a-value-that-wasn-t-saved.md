---
id: BUG-32
type: bug
title: Settings shows a value that wasn't saved
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
created: 2026-11-18T20:39:26Z
history:
  - at: 2026-11-18T20:39:26Z
    field: status
    from: null
    to: New
    by: dev-lead
---

## Description

When a settings write fails, the Settings page keeps showing the new value and nothing tells the user. One way it
fails is Windows `EPERM` on the rename that saves the file. STORY-63's JsonStore retry now retries that, but the write
can still fail after the retries.

## Acceptance criteria

- [ ] A failed save shows an error on Settings and the control goes back to the saved value
- [ ] A regression test reproduces the failed save and fails before the fix

## Tasks

## Notes

Filed by the dev lead; not scheduled yet.
