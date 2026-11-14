# 0038 — The scope baseline is the moment a feature goes in progress, read from its history

Date: 2026-11-13 · Status: proposed

## Context

ADR 0023 (STORY-51) set a feature's scope baseline at approval and stored it on the card as
`extra.baseline = { at, stories }`. FEAT-7's shaping moved the baseline to Start feature (ADR 0024): stories added
between approval and start are still being planned, and the burn-up (STORY-16) must start at the same moment as the
"+N added" count, or the two disagree. Features approved before this change already carry a stored baseline, and cards
are the user's files (ADR 0002), so nothing may be lost or rewritten behind their back.

## Decision

- **One baseline, derived, never stored.** A feature's scope baseline is the time of the first status event in its
  `history[]` that moves it into `active` or `done`. Start feature writes that event (approved → active) on the feature
  branch, so the baseline is the moment of Start. A feature set in progress by hand, with no such event, uses the later
  of its `created` time and its last recorded status change, so stories planned before then stay planned. A feature that never went in progress has no baseline: nothing is added, and there is
  no burn-up.
- **Approval stores nothing.** `planApproval` only sets the status. Start stores nothing either; the status event it
  already writes is the fact.
- **Stored approval baselines are ignored, not migrated.** A card's `baseline` key stays in `extra` and round-trips
  byte for byte, so parsing and writing cards never break. Nothing reads it. Migrating would mean writing to cards on
  branches and in worktrees Featra doesn't own at that moment, for no gain: the history already has the answer.
  `LEGACY_BASELINE` names the key so tests can prove it is neither written nor read.
- **Added scope is by time.** An item counts as added when it joined the feature (created under it, or moved under it)
  strictly after the baseline. Joining in the same instant as Start is planned scope.
- **The burn-up starts at the baseline**, the same moment, so the chart and "+N added" always agree (ADR 0005: no
  forecast).
- **What a bar says is computed in work-format** (ADR 0003): a feature's bar by stage ("1 done · 1 needs your Accept ·
  2 in progress · 1 not started"), an epic's by feature status ("1 done · 2 in progress · 1 approved"), and the "+N
  added" breakdown with stories and bugs apart ("+3 added: 2 stories · 1 bug"). The client shows the text; it builds
  none of it.

## Supersedes

- ADR 0023's "The scope baseline is stored on the feature as `extra.baseline = { at, stories }`", the rule that added
  scope is the stories not in `baseline.stories`, and its consequence "The baseline is now a stored fact for new
  features".
- The older computed fallback (the moment the feature's first story goes In Progress), which ADR 0023 kept for features
  without a stored baseline.
- CONTEXT.md's definition of **Scope baseline**, which is updated to this one.

## Consequences

- A feature approved before this change keeps working: its baseline is the moment it went in progress, read from its
  history. Stories it had at approval and stories added before Start are planned scope.
- A story created in the same second as approval but after it, which ADR 0023 counted by list, is now simply planned:
  approval no longer matters.
- Anything that changes a feature's status history changes its baseline. Status events are append-only, so the first
  move into progress never changes once written.
