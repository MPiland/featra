---
id: BUG-17
type: bug
title: Draft chat's Message box sometimes missing on Windows
status: Acceptance
parent: FEAT-5
order: 9
origin: bug
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/bug-17
pr: "33"
created: 2026-11-11T22:00:00Z
history:
  - at: 2026-11-11T22:00:00Z
    field: status
    from: null
    to: New
    by: session:dev-lead
  - at: 2026-11-11T22:05:00Z
    field: status
    from: New
    to: In Progress
    by: session:bug-17
  - at: 2026-11-11T22:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:bug-17
  - at: 2026-11-11T23:23:14Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

In CI run 43093488195, attempt 3 (E2E on Windows), `approve-reject.spec.ts:18` failed at `draft-chat.ts:19`:
`expect(getByRole('textbox', { name: 'Message' })).toBeEditable()` timed out after 5000 ms with "element(s) not found".
Attempts 1 and 2 of the same code passed.

## Acceptance criteria

- [x] The cause is found, or the evidence for it is recorded: a chat that opens with no composer (STORY-53 story sessions, a gone chat), a chat-open race, a wrong chat selected, or slowness.
- [x] The helper waits for the signal that the chat has opened, not for the composer alone, and a chat that never opens fails there.
- [x] The original assertions stay as they are.

## Tasks

- [x] Read the CI log and the chat-open path (New chat dialog, `startedChat`, `ChatView`)
- [x] Wait for the picker to close, with its own limit, before looking for the composer
- [x] E2E on CI

## Notes

Cause: not proven; timing, not product. The trace upload failed in that run (the artifact service answered HTML), so
there is no page snapshot. What the log shows: the failing test was the first of the run, straight after Electron's
binary was downloaded, and took 14.1 s; in attempts 1 and 2 it took 5.4 s and 6.2 s. It failed on the first chat of
a fresh app, so it was not a story session (those come from Start, not this helper), not a gone chat (no saved
history), and `before` was null, so it was not an old chat's composer.

What the code allows: the composer is absent in three cases only: `chat.story` (watch-only, STORY-53), a `gone` notice
(a restored chat whose history is gone), and while the New chat picker is open, because the app behind it is inert
(`inert` on the shell, so the role query finds nothing). A fresh chat is none of the first two. The third is the one
left: the picker closes only when `chat.start` answers, and on a cold runner that answer took more than the 5 s default
for the composer check. Nothing in the start path blocks (roles, chat map, a non-awaited save), so this is slowness of
the first run, not an ordering bug. `useChats` keeps a just-started chat in `started` until the list has it, so no
list-push race drops it.

Fix: `draftInNewChat` waits for the picker to close (20 s, named `CHAT_START_MS`) before checking the composer. A start
that is slow passes; one that is refused or never answers fails at the picker, which says what is wrong. Assertions
are unchanged. If it recurs with the picker closed and no composer, that is a product bug and the new failure point
will say so.

No regression test: the failure needs a cold runner where `chat.start` takes over 5 s, which can't be made to happen on
demand. The helper is test code and the product path is unchanged, so the change is proved by the e2e jobs passing on
CI. The same picker-then-composer sequence is hand-rolled in about 11 other specs; a shared `startChat(page, role)`
helper is on the roadmap, not done here.
