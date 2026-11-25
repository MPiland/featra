---
id: STORY-73
type: story
title: Design review of screenshots
status: In Progress
parent: FEAT-9
order: 7
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: claude/story-73-design-review
pr: null
created: 2026-11-23T12:00:00Z
history:
  - at: 2026-11-23T12:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-25T04:01:56Z
    field: status
    from: New
    to: In Progress
    by: dev-lead
---

## Description

As a builder, layout and design problems in a story's screenshots are caught before the story reaches me for Accept.

## Acceptance criteria

- [x] Before a story moves to Acceptance, the reviewing agent checks its screenshots for layout and design problems (test: packages/work-format/test/design-review.test.ts::AC1: before a story moves to Acceptance, its screenshots wait for the design review > waits once a story with screenshots is in review; packages/work-format/test/design-review.test.ts::AC1: before a story moves to Acceptance, its screenshots wait for the design review > refuses the move to Acceptance while it waits, by the story's session or the Dev Lead; packages/work-format/test/design-review.test.ts::AC1: before a story moves to Acceptance, its screenshots wait for the design review > can't be skipped: a story goes to review before Acceptance while the check is on; packages/work-format/test/design-review.test.ts::what counts as a story's screenshots > is a page Featra captured or a test screenshot it matched, never the agent's own image; packages/server/test/design-review.test.ts::AC1 and AC2: a story with screenshots waits in review for the Dev Lead's design review > tells the Dev Lead when the story's turn ends that it waits for design review, naming the screenshots; packages/server/test/design-review.test.ts::AC1 and AC2: a story with screenshots waits in review for the Dev Lead's design review > keeps the story in review: the move to Acceptance is refused until the check is cleared; packages/server/test/story-notices-from.test.ts::a story session's own notice > waits while its turn is on, and goes after the turn's notice in one message; packages/client/test/components/design-review-pane.test.tsx::AC1 and AC2: the card shows where the design review stands > says it waits for the Dev Lead, with nothing to do here; apps/desktop/e2e/design-review.spec.ts::Design review: the Dev Lead's findings reach the story's session and keep it in review until the Dev Lead clears it)
- [x] Findings are sent to the story's session, and the story stays in review until they're addressed or the reviewer clears them (test: packages/work-format/test/design-review.test.ts::AC2: findings keep the story in review until they're fixed or cleared > records the Dev Lead's findings, which keep the story in review; packages/work-format/test/design-review.test.ts::AC2: findings keep the story in review until they're fixed or cleared > waits again when the story's session reports them fixed; packages/work-format/test/design-review.test.ts::AC2: findings keep the story in review until they're fixed or cleared > lets the Dev Lead clear it after findings; packages/server/test/design-review.test.ts::AC1 and AC2: a story with screenshots waits in review for the Dev Lead's design review > sends the Dev Lead's findings to the story's session, and records them on the card; packages/server/test/design-review.test.ts::AC1 and AC2: a story with screenshots waits in review for the Dev Lead's design review > captures the screenshots again when the session reports the findings fixed, and the Dev Lead reviews again; packages/server/test/design-review.test.ts::AC1 and AC2: a story with screenshots waits in review for the Dev Lead's design review > lets the Dev Lead clear the check and move the story on to Acceptance in one call; packages/server/test/design-review.test.ts::findings the story's session can't take now > are refused while it is working, and nothing is recorded; packages/server/test/design-review.test.ts::when the Dev Lead chat that started the story is gone > says so on the card, and the user's Clear records it and moves the story to Acceptance; packages/client/test/components/design-review-pane.test.tsx::AC1 and AC2: the card shows where the design review stands > shows the findings sent to the story's session; packages/client/test/components/design-review-pane.test.tsx::when the Dev Lead chat that started the story is gone > says so, and the user clears the review; apps/desktop/e2e/design-review.spec.ts::Design review: the Dev Lead's findings reach the story's session and keep it in review until the Dev Lead clears it)
- [x] A story with no screenshots moves on without this check (test: packages/work-format/test/design-review.test.ts::AC3: a story with no screenshots moves on without the check > has no design review, and moves to Acceptance; packages/work-format/test/design-review.test.ts::AC3: a story with no screenshots moves on without the check > treats the agent's own image as evidence, not a screenshot to review; packages/server/test/design-review.test.ts::AC3: a story with no screenshots moves on without the check > is not reviewed, and the Dev Lead isn't told it waits; packages/client/test/components/design-review-pane.test.tsx::AC3: a story with no design review shows none > has no design review on its card; apps/desktop/e2e/design-review.spec.ts::Design review: a story with no screenshots moves on to Acceptance without it)
- [x] The project can turn the check off (test: packages/work-format/test/design-review.test.ts::AC4: the project's setting > is on by default when the proof captures screenshots, and off otherwise; packages/work-format/test/design-review.test.ts::AC4: the project's setting > turned off, lets a story with screenshots move on to Acceptance; packages/server/test/design-review.test.ts::AC4: the project turns the check off in Settings > shows it on by default with screenshots, writes the choice, and lets a story with screenshots move on; packages/client/test/components/settings/ProjectProof.test.tsx::STORY-73 AC4: the project can turn the design review off > is on next to the proof when it captures screenshots, and turns off and on again; apps/desktop/e2e/design-review.spec.ts::Design review: turned off in Settings, a story with screenshots moves on to Acceptance)

## Tasks

- [x] work-format: the design review rules, the designReview setting and update_card input, the card's view, the gate on agents' reports
- [x] server: the waits-for-review notice to the Dev Lead, findings delivered to the story's session, Clear when the Dev Lead chat is gone, the setting
- [x] MCP: update_card's description teaches the Dev Lead the review
- [x] client: the design review on the card pane, and its switch in Settings > Project > Proof
- [x] e2e: three journeys, ux-screens feat9-design-review-waiting, -findings, -cleared and -settings
- [x] ADR 0045 and decisions.md

## Notes

Shaped with the user on 2026-11-23, split out of STORY-25. This check spends agent tokens because an agent does it; it's part of the agent's review, not an app feature.

Decided with the user on 2026-11-24 (dev lead):

- The Dev Lead reviews. When a story with screenshots reaches the review stage, the Dev Lead chat that delegated it checks the screenshots for layout and design problems. It records findings or clears the check through `update_card`, and sends findings to the story's session. Featra doesn't move the story to Acceptance until the check is cleared.
- The check is on by default when the project's proof includes screenshots. The project can turn it off in Settings.

## Depends on

- STORY-25 Choose the project's proof and capture screenshots
