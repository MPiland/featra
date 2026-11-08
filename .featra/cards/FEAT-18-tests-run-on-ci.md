---
id: FEAT-18
type: feature
title: Tests run on CI
status: active
parent: EPIC-1
order: 4
origin: added
created: 2026-11-07T19:20:00Z
history:
  - at: 2026-11-07T19:20:00Z
    field: status
    from: null
    to: approved
    by: user
  - at: 2026-11-08T01:28:39.915Z
    field: status
    from: approved
    to: active
    by: user
---

## Description

Tests run on GitHub Actions instead of the user's only PC, and main only takes code that passes on Windows and Linux (decisions.md, 2026-11-07). Built before FEAT-3 because BUG-4 and every later story's e2e runs depend on it.

## Depends on

- Nothing. Blocks BUG-4.
