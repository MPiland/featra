# 0023 — Approving a draft commits its cards to main, all or nothing; rejecting deletes them

Date: 2026-11-10 · Status: accepted

## Context

A draft (ADR 0021) is uncommitted and owned by main. STORY-51 gives the user the two ways out: Approve and Reject.
Approving must put the cards in git without touching anything else the user has in main's checkout; rejecting must leave
git exactly as it was. Both must be safe against concurrent card writes and against a repo that can refuse a commit.

## Decision

- **One server method per action** (`draft.approve`, `draft.reject`), each run inside the card lane, so no card write
  interleaves. Draft state is re-checked inside the lane. `applyCardEdit` still refuses a status edit that leaves draft.
- **Approve** plans with the pure `planApproval` (work-format): the feature becomes `approved` with a `by: user` status
  event, live stories stay New, Cancelled stories are dropped. The scope baseline is stored on the feature as
  `extra.baseline = { at, stories }`; `scopeBaseline` prefers it and falls back to the first story going active for
  features without one.
- **Commit** only the draft's files: `git add -A -- <paths>` then `git commit -m "FEAT-N: approved <title>" -- <paths>`
  in main's checkout, so staged or unstaged changes of the user are never included. Repo hooks run; never
  `--no-verify`; never push. Refused up front if the base branch isn't checked out in main's checkout, or it is
  mid-merge, rebase, cherry-pick, revert or bisect.
- **All or nothing.** If the commit fails (a hook, for instance) the paths are unstaged and every card file is restored
  to its exact earlier bytes, cancelled stories included, and the git error is shown.
- **Reject** refuses if git tracks or has staged any of the draft's files; otherwise it deletes them (rolling back on a
  failure). Git shows nothing from the draft afterwards. The chat is untouched and hears nothing.
- After approval a later `draft_cards` from that chat gets the existing refusal for a feature that has left draft.

## Consequences

Approval depends on git being usable in main's checkout; the user sees the reason when it isn't. The baseline is now a
stored fact for new features. Reject needs no commit, so there is nothing to undo in history.
