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
  event, live stories stay New. The scope baseline is stored on the feature as `extra.baseline = { at, stories }`.
  For a feature with one, added scope is the stories not in `baseline.stories` (the list, not the time, so a story
  created in the same second still counts); `scopeBaseline` returns its `at`. A feature without one keeps the old
  computed behaviour.
- **The draft is the feature and every story under it.** Each must be untracked and owned by main's checkout. A child
  that is in a worktree or on a feature branch refuses both actions, naming it ("STORY-N is in worktree x; move it out
  of FEAT-N first."), and so does a live child git already tracks. A Cancelled child git tracks goes into the commit as
  Cancelled; an untracked Cancelled child is deleted. A story the user added during review is part of the draft, and the
  Reject question counts exactly these stories (`CardView.draftStories`).
- **The cards are read inside the lane.** Approve parses each card from the bytes it reads there (not from the scan)
  and checks them unchanged just before writing, so an edit made outside Featra is kept or refuses the approve.
- **Commit** only the draft's files: `git add -A -- <paths>` then `git commit -m "FEAT-N: approved <title>" -- <paths>`
  in main's checkout, so staged or unstaged changes of the user are never included. Repo hooks run; never
  `--no-verify`; never push. Refused up front if main's checkout is mid-merge, rebase, cherry-pick, revert or bisect,
  is detached ("Main's checkout is detached. Check out <branch> first."), is on another branch, or (Approve) the branch
  has no commits yet.
- **The base branch** is `baseBranch` from `.featra/config.yaml` when the user set it, else `origin/HEAD`, else whichever
  of main and master exists locally (found once per scan and reused while git's part is). `GitState.detected` says
  which. The server's git environment is unchanged: it still passes `GIT_CONFIG_COUNT` and friends through.
- **All or nothing, exactly.** Before `git add` the index entries of the paths are recorded (`git ls-files -s`). If the
  commit fails (a hook, for instance) every card file is restored to its exact earlier bytes and those index entries
  are put back, so a path the user had already staged stays staged. If putting things back fails too, the message says
  so and to check git status, instead of "nothing was changed".
- **Reject** refuses if git tracks or has staged any of the draft's files; otherwise it deletes them (rolling back on a
  failure). Git shows nothing from the draft afterwards. The chat is untouched and hears nothing.
- After approval a later `draft_cards` from that chat gets the existing refusal for a feature that has left draft.

## Consequences

Approval depends on git being usable in main's checkout; the user sees the reason when it isn't. The baseline is now a
stored fact for new features. Reject needs no commit, so there is nothing to undo in history.
