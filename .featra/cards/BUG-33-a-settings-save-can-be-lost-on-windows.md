---
id: BUG-33
type: bug
title: A settings save can be lost on Windows
status: Done
parent: FEAT-19
order: 4
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-63-macos-ci
pr: https://github.com/MPiland/featra/pull/72
created: 2026-11-18T20:51:05Z
history:
  - at: 2026-11-18T20:51:05Z
    field: status
    from: null
    to: New
    by: dev
  - at: 2026-11-18T20:51:05Z
    field: status
    from: New
    to: In Review
    by: dev
  - at: 2026-11-18T21:23:40Z
    field: accepted
    from: null
    to: accepted
    by: user
  - at: 2026-11-18T21:23:40Z
    field: status
    from: In Review
    to: Done
    by: user
---

## Description

Found while running STORY-63's e2e suite (E2E (Windows) at 432a5ea, settings.spec's AC6). Settings showed "Minimize to
tray" while `settings.json` still said "quit".

The JSON stores (`settings.json`, `ui-state.json`, saved chats) save through a temp file and a rename. Windows refuses
that rename with EPERM (or EBUSY) while another program has the file open, and nothing tried again, so the save was
lost. Card writes already retry a busy rename (BUG-16's `retryBusy`); the JSON stores didn't.

## Acceptance criteria

- [x] A save whose rename Windows refuses as busy is tried again, and the new value lands (test: packages/server/test/json-store-busy.test.ts::a JSON store saving a file another program has open (STORY-63) > tries the rename again after EPERM and EBUSY, and the new value lands)
- [x] A save made while another program reads the file lands once that program lets go (test: packages/server/test/json-store-busy.test.ts::a JSON store saving a file another program has open (STORY-63) > saves while a reader holds the real file open, once the reader lets go)

## Tasks

- [x] `createJsonStore` retries a busy rename with `retryBusy`
- [x] Regression tests that failed before the fix

## Notes

Fixed on STORY-63's branch (PR #72). Cause and fix: decisions.md, 2026-11-18 — STORY-63. The page still doesn't show a
save that failed for good: BUG-32.
