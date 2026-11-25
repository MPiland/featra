# 0045 — Design review of screenshots

Date: 2026-11-24 · Status: proposed

## Context

STORY-73: before a story moves to Acceptance, its screenshots are checked for layout and design problems, findings go
to the story's session, and the story stays in review until they're addressed or the reviewer clears them. A story
with no screenshots moves on without the check, and a project can turn it off.

The user decided (2026-11-24) that the Dev Lead chat that delegated the story reviews: it records findings or clears
the check with `update_card`, and Featra sends the findings to the story's session. Featra starts no new agent session
for the review and doesn't move the story to Acceptance until the check is cleared. The check is on by default when
the project's proof includes screenshots, and can be turned off in Settings > Project, next to Proof.

Options considered for who reviews: a new reviewer session per story (costs a session and tokens per story, and loses
the Dev Lead's context); the story's own session (marks its own work); the Dev Lead that delegated the story (already
holds the feature's intent, and is already told when a story's turn ends, ADR 0028). Options for where the gate sits:
on every stage change (would also gate the user's own edits in the card pane), or on agents' reports only.

## Decision

- **Featra's part is deterministic and costs no tokens.** It gates the move to Acceptance, shows where the review
  stands on the card, tells the Dev Lead a story waits, and delivers findings as a message. The Dev Lead learns how to
  review only from `update_card`'s description; nothing is injected into its prompt.
- **What counts as "has screenshots"**: a criterion whose evidence is a screenshot Featra attached (ADR 0044): a page
  it captured (`ac<n>-page.<ext>`) or a test's screenshot it matched (`ac<n>-test.<ext>`) in the story's evidence
  folder. An agent's own image is evidence, not a screenshot to review.
- **The setting** is `designReview` in `.featra/config.yaml`: unset means on when `proof` is `screenshots` or `both`;
  `true` or `false` is the project's own choice. Settings > Project > Proof shows it as a switch below the proof.
- **When it applies**: a story, with the check on, a review stage separate from the last agent stage (In Review
  before Acceptance), the story at or past review, and screenshots. Anything else has no design review.
- **State lives in the card's history.** Each finding, fix and clear is a `design-review` event (`findings: <text>`,
  `fixed`, `cleared`). A round starts at the last move into review from any other stage, so a story sent back, or one
  the user moves back from Acceptance, is reviewed again: a clear never carries over (Dev Lead decision, 2026-11-25).
  The last event of the round decides: none or `fixed` is waiting, `findings: …` is findings sent, `cleared` is
  cleared.
- **The gate is on agents' reports** (`applyReport`): a report that moves the story to Acceptance is refused while the
  review isn't cleared, and with the check on a report can't skip from before review straight to Acceptance. The
  user's own stage edit in the card pane isn't gated. While the story's screenshots are still being captured (its move
  to review is written, the capture runs outside the card lane), a report that moves it to Acceptance is refused too,
  so no move gets in before the screenshots are attached and the review can wait for them.
- **Auto-merge waits for the review**: a story whose design review isn't cleared doesn't merge on its own (ADR 0034),
  as a held story doesn't. Merge by hand isn't gated: it is the user's call, as for a held story.
- **Who does what**: `designReview: {findings}` and `{clear: true}` are the Dev Lead's: the chat the story's session
  nests under, which started it. Another chat that may update the card, such as the one that drafted its feature,
  can't. `{clear: true}` may move the story to Acceptance in the same call. `{fixed: true}` is the story
  session's, only after findings; it captures the screenshots again and the Dev Lead is told again. Findings are at
  most 2000 characters.
- **Telling the Dev Lead**: when a story enters review with screenshots, or reports its findings fixed, its session
  posts a "waits for design review" notice naming the evidence folder and the files. It is held while the session's
  turn runs and goes with that turn's notice, in one message (ADR 0028).
- **Delivering findings**: the story's session is opened outside the card lane, then the findings are sent as a
  message from the Dev Lead and recorded in the lane, after every other check on the report has passed and just before
  the card is written (send, then record), so findings the session got are always on the card. A session that is
  working, stopped, queued or merging refuses them, and nothing is recorded.
- **When the Dev Lead chat is gone** (no chat the story's notices reach: it has no parent chat, or that chat is gone,
  closed or can't run, the same test notices go by), the card says so. The user clears the review there, which records `cleared` by the user and moves the story to Acceptance,
  or sends the story back, which is allowed while the review waits, as from Acceptance.

## Consequences

- The review costs only the Dev Lead's turn on the notice; there are no new sessions.
- A Dev Lead that ignores a notice leaves the story in review; the card shows that it waits.
- The rules are pure (`design-review.ts` in work-format); the server wires delivery, notices and the card's view
  (`design-reviews.ts`), and the MCP's description is the only instruction to the agent.
- A project whose proof doesn't capture screenshots sees no change unless it turns the check on.
