---
id: STORY-71
type: story
title: Ask for changes before approving
status: In Progress
parent: FEAT-9
order: 4
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-71-ask-changes
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-24T05:42:36Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, when a feature isn't right yet, I tell the Dev Lead why from the approval screen, and the feature shows that I asked until it's handled.

## Acceptance criteria

- [x] "Not yet" on the approval screen needs a reason; the reason is sent to the feature's Dev Lead chat as my message (test: packages/client/test/components/feature-changes.test.tsx::AC1, AC2: Not yet takes a reason, and the screen shows Changes asked with it > sits beside Approve and can't be sent without a reason; packages/client/test/components/feature-changes.test.tsx::AC1, AC2: Not yet takes a reason, and the screen shows Changes asked with it > shows the server's refusal with the reason kept, and logs nothing; packages/server/test/feature-changes.test.ts::Not yet (STORY-71 AC1, AC2) > sends the reason to the Dev Lead's chat as the user's message, then logs it in the feature's history; packages/server/test/feature-changes.test.ts::Not yet (STORY-71 AC1, AC2) > refuses an empty reason: nothing is sent or logged; packages/server/test/feature-changes.test.ts::Not yet (STORY-71 AC1, AC2) > is refused as a normal send is while the Dev Lead is mid-turn: nothing is logged; packages/server/test/feature-changes.test.ts::Not yet (STORY-71 AC1, AC2) > is refused when the Dev Lead's chat is gone with its project: nothing is logged; packages/server/test/feature-changes.test.ts::a feature without a live Dev Lead chat (STORY-71 AC1) > is refused when nobody drafted it and no Dev Lead started its stories: nothing is logged; packages/server/test/feature-changes.test.ts::a feature without a live Dev Lead chat (STORY-71 AC1) > is refused when the chat that drafted it isn't one Featra has; packages/server/test/review-changes.test.ts::changes asked on the review screen (STORY-71) > refuses an empty reason and a request without one; packages/work-format/test/feature-changes.test.ts::the reason (AC1) > is required and has a limit; packages/work-format/test/feature-changes.test.ts::the reason (AC1) > reaches the Dev Lead's chat naming the feature; apps/desktop/e2e/ask-changes.spec.ts::Not yet with a reason: Changes asked shows, the Dev Lead marks it handled, and its reply shows)
- [x] The reason is logged in the feature's history and the screen shows "Changes asked" with it (test: packages/client/test/components/feature-changes.test.tsx::AC1, AC2: Not yet takes a reason, and the screen shows Changes asked with it > sends the reason, logs it in the feature's history, and shows Changes asked with it; packages/client/test/components/feature-changes.test.tsx::AC1, AC2: Not yet takes a reason, and the screen shows Changes asked with it > lists every reason asked in the round; packages/server/test/feature-changes.test.ts::Not yet (STORY-71 AC1, AC2) > adds a reason asked again while changes are asked to the same round; packages/server/test/review-changes.test.ts::changes asked on the review screen (STORY-71) > shows Changes asked with the reason, leaves Approve as it was, and clears on Dismiss (AC2, AC4, AC5); packages/server/test/review-changes.test.ts::changes asked on the review screen (STORY-71) > keeps the changes asked across a restart, since they are read from the feature's history; packages/work-format/test/feature-changes.test.ts::changes asked on a feature (AC2) > are logged in its history by the user, and read back after the card is written and read again; packages/work-format/test/feature-changes.test.ts::changes asked on a feature (AC2) > collect every reason asked again before the Dev Lead replies, oldest first; packages/work-format/test/feature-changes.test.ts::the changes as the client reads them > ride on the review; apps/desktop/e2e/ask-changes.spec.ts::Not yet with a reason: Changes asked shows, the Dev Lead marks it handled, and its reply shows)
- [x] The Dev Lead can mark it handled through the MCP, saying what it did; the screen then shows that reply and "Changes asked" clears (test: packages/client/test/components/feature-changes.test.tsx::AC3: the Dev Lead's reply > shows the reply once the Dev Lead marks the changes handled, and Changes asked clears; packages/mcp/test/mark-changes-handled.test.ts::mark_changes_handled through the Featra MCP (STORY-71 AC3) > is listed with the description that teaches the Dev Lead when to call it and that a chat reply isn't enough; packages/mcp/test/mark-changes-handled.test.ts::mark_changes_handled through the Featra MCP (STORY-71 AC3) > refuses a story session, any other chat that isn't the Dev Lead, a feature not in progress, bad input and a project with the MCP off; packages/mcp/test/mark-changes-handled.test.ts::mark_changes_handled through the Featra MCP (STORY-71 AC3) > records the Dev Lead's reply on the feature's branch, which clears Changes asked; a second call is refused; packages/server/test/feature-changes.test.ts::handled and dismissed (STORY-71 AC3, AC4) > logs the Dev Lead's reply by its session, which ends the round; packages/server/test/review-changes.test.ts::changes asked on the review screen (STORY-71) > shows the Dev Lead's reply once it marks the changes handled (AC3); packages/work-format/test/feature-changes.test.ts::the Dev Lead marking them handled (AC3) > records its reply by its session and ends the round: the reply shows and Changes asked clears; packages/work-format/test/feature-changes.test.ts::the Dev Lead marking them handled (AC3) > starts a new round when the user asks again after the reply; packages/work-format/test/feature-changes.test.ts::the Dev Lead marking them handled (AC3) > counts only the first reply to a round; apps/desktop/e2e/ask-changes.spec.ts::Not yet with a reason: Changes asked shows, the Dev Lead marks it handled, and its reply shows)
- [x] I can dismiss "Changes asked" myself (test: packages/client/test/components/feature-changes.test.tsx::AC4: Dismiss > clears Changes asked and logs the Dismiss; packages/server/test/feature-changes.test.ts::handled and dismissed (STORY-71 AC3, AC4) > logs the user's Dismiss, which clears the changes asked; a second Dismiss is refused; packages/server/test/feature-changes.test.ts::handled and dismissed (STORY-71 AC3, AC4) > refuses the Dev Lead's reply once the user dismissed the changes, and Dismiss once they are handled; packages/server/test/feature-changes.test.ts::handled and dismissed (STORY-71 AC3, AC4) > keeps exactly one of a reply and a Dismiss made at once; packages/server/test/review-changes.test.ts::changes asked on the review screen (STORY-71) > shows Changes asked with the reason, leaves Approve as it was, and clears on Dismiss (AC2, AC4, AC5); packages/work-format/test/feature-changes.test.ts::the user dismissing them (AC4) > is logged by the user and clears Changes asked; packages/work-format/test/feature-changes.test.ts::the user dismissing them (AC4) > leaves a reply that comes after it uncounted)
- [x] Approve stays available while changes are asked (test: packages/client/test/components/feature-changes.test.tsx::AC5: Approve stays available while changes are asked > leaves Approve enabled beside Changes asked, and approving still works; packages/server/test/review-changes.test.ts::changes asked on the review screen (STORY-71) > shows Changes asked with the reason, leaves Approve as it was, and clears on Dismiss (AC2, AC4, AC5); apps/desktop/e2e/ask-changes.spec.ts::Not yet with a reason: Changes asked shows, the Dev Lead marks it handled, and its reply shows)

## Tasks

- [x] work-format: the changes-asked, changes-handled and changes-dismissed events, changesOf and the copy
- [x] server: feature.askChanges and feature.dismissChanges (send, then record), the Dev Lead lookup shared with shaping, review.watch carries changes
- [x] MCP: mark_changes_handled, Dev Lead only (agent method feature.changesHandled)
- [x] client: Not yet beside Approve, Changes asked with Dismiss, the Dev Lead's reply
- [x] e2e journey with screenshots feat9-changes-asked and feat9-changes-handled
- [x] ADR 0042, CONTEXT.md and decisions.md

## Notes

Shaped with the user on 2026-11-23. "Not yet" doesn't create cards; the Dev Lead decides what to add. A chat reply alone doesn't clear it.

## Depends on

- STORY-69 Review a feature on one screen
