---
id: STORY-7
type: story
title: Inbox and notifications
status: In Review
parent: FEAT-3
order: 8
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-7-inbox
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-09T22:07:30Z
    field: status
    from: New
    to: In Progress
    by: session:story-7
  - at: 2026-11-09T22:34:33Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-7
---

## Description

As a builder, I find every approval and question waiting on me in one Inbox and get told when one arrives, so a
blocked agent doesn't sit unnoticed while I'm away.

## Acceptance criteria

- [x] An approval or question unanswered for 10 minutes also appears in the Inbox with its chat and card; the wait is set in Settings › App (test: packages/server/test/inbox.test.ts > AC1 (is not in the Inbox until it has waited as long as the wait, then is, with its chat and card; brings a question too, and omits the card for a chat that has none; uses each watcher's own wait, the setting the page sends; follows a wait changed while requests are pending; keeps several chats' requests oldest first, and only the project's own); packages/server/test/ws-inbox.test.ts > STORY-7: inbox.watch, inbox.asked > answers with the Inbox, pushes each change, and clears an item the chat's own chat.approve answers; packages/work-format/test/inbox.test.ts > dueItems; packages/client/test/components/inbox.test.tsx > AC1 (is in the chat at once and in the Inbox only after the wait, with its chat's name and the card; shows a question as the chat does; takes the wait from Settings > General); apps/desktop/e2e/inbox.spec.ts > an approval left unanswered reaches the Inbox with a count and a notification, is answered there once, and the notification opens its chat)
- [x] Answering it in the Inbox or the chat answers it once and clears it from both (test: packages/server/test/inbox.test.ts > AC2 (clears the item when the chat's own approve answers it, and the agent is told once; clears a question when it is answered; clears only the answered request when a chat has two); packages/server/test/inbox-edge.test.ts > edge cases (never shows a request answered in the chat just before the wait passes; clears a request answered in the chat just after the wait passes; clears a request when the user stops the turn while it is in the Inbox; clears requests when their project is closed); packages/client/test/components/inbox.test.tsx > AC2 (answers through the chat's own approve call; answers a question from the Inbox through chat.answer; clears the item when the chat answers it, with the Inbox open; clears the item when the turn is stopped while it waits); apps/desktop/e2e/inbox.spec.ts > an approval left unanswered reaches the Inbox with a count and a notification, is answered there once, and the notification opens its chat)
- [x] When Featra isn't focused, a desktop notification fires as soon as one arrives; clicking it opens the chat. Notifications can be turned off in Settings › App (test: apps/desktop/test/notifier.test.ts > AC3: notifications; packages/server/test/inbox-edge.test.ts > AC3 (pushes each approval and question at once, for the project's chats only); packages/client/test/components/inbox.test.tsx > AC3 (tells the host at once, before the wait, once per request; opens the chat a clicked notification names; turns notifications off and on in Settings > General); apps/desktop/e2e/inbox.spec.ts > an approval left unanswered reaches the Inbox with a count and a notification, is answered there once, and the notification opens its chat)
- [x] The sidebar's Inbox shows how many are waiting (test: packages/client/test/components/inbox.test.tsx > AC4 (shows nothing at first, then the count of items past the wait, and nothing again when they are answered; counts every request, across chats and kinds; shows the count from any view); apps/desktop/e2e/inbox.spec.ts > an approval left unanswered reaches the Inbox with a count and a notification, is answered there once, and the notification opens its chat)

## Tasks

- [x] work-format: Inbox items, the wait (minutes) and which requests are due, chat card, protocol methods
- [x] Server: an Inbox that holds each request with its asked time on the server's clock, due after a wait; `inbox.watch` and `inbox.asked`
- [x] Settings: the Inbox wait and Notifications in Settings › General; the wait reaches the server per watch
- [x] Client: the Inbox view answers through the chat's own approve and answer path; the sidebar count
- [x] Desktop: a notifier that fires when Featra isn't focused, honours the setting, and opens the chat on click
- [x] Tests: unit (due rules, edge cases), server integration through the real chat manager, over the socket, client components, one Electron journey
- [x] decisions.md updated

## Notes

- Chats can't be deleted yet, so "a chat deleted or closed" is tested as its project being closed (`closeProjects`).
- Depends on: STORY-45, STORY-46.
- Decisions 2026-11-08: the Inbox wait is 10 minutes (a sign the person is away); notifications fire at once and can
  be turned off. Logging answers moved to STORY-47.
