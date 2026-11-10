# 0024 — Start creates the feature's branch, and ownership moves to it

Date: 2026-11-10 · Status: accepted

## Context

An approved feature (ADR 0023) lives only in the base branch. Start is the step after Approve: it makes the branch the
feature's work happens on. Under ADR 0002 a feature whose branch exists and is not merged is owned by that branch, and
so are its stories, so the move of ownership needs no rule of its own. Start must not disturb the user's checkout, must
leave no half-made branch, and must work for the user (window) and for the Dev Lead (MCP `start_feature`).

## Decision

- **One server method, `feature.start`**, on the window socket (`{dir, id}`) and on the agent socket (`{feature}`), run
  inside the card lane like `draft.approve`. The status is re-checked inside the lane, so two starts make one branch.
- **The branch** is `feature/<N>-<slug of the title>` (`featureBranchName`, pure, in work-format), or `feature/<N>` when
  the title has no letters or digits. It is made from the base branch (ADR 0023: `baseBranch`, else `origin/HEAD`, else
  main or master).
- **Main's checkout is never touched, and there is no checkout at all.** The commit is built with git plumbing:
  `hash-object -w` writes the updated card, a temporary index (`GIT_INDEX_FILE`, a file in the git folder that is
  removed afterwards) is seeded from the base commit's tree by `read-tree`, `update-index` replaces that one path,
  `write-tree` and `commit-tree -p <base>` make the commit, and `update-ref refs/heads/<branch> <commit> ""` creates
  the branch (the empty old value makes it create-only, so it fails if the branch exists by then). No worktree, no
  temporary folder; HEAD, the index and the working tree of the user's checkout are as they were, even when it is on
  another branch.
- **What it commits** is the feature as the base branch has it (the branch is named from that copy, not from main's
  working tree), changed from `approved` to `active` with a status event (`by: user` from the window,
  `by: session:<chat id>` from the MCP; the chat comes from the agent's secret, ADR 0019), as `FEAT-N: started <title>`.
  Only that one file. Never pushed.
- **No hooks run on it (the user's ruling).** Featra's own card-only bookkeeping commits, made on a branch with no
  checkout, don't run the repository's hooks: a hook is for a change someone made in a checkout, and this commit holds
  nothing but a status change Featra wrote. Every commit made in a checkout still runs hooks: Approve in main (ADR 0023) and every commit of an agent or the user. Nothing uses `--no-verify`; there is simply no hook to run.
- **Ownership moves by the existing rules.** The branch is one commit ahead of base, so `branchStateOf` reads it as
  active, `ownerOf` makes it the owner of the feature and its stories, and `resolveCopies` shows only the owner's copy.
  Main's copies stay on disk and are no longer shown. There is no UI special case.
- **Refusals**, each one sentence and naming what to do, and nothing changed: the feature isn't a feature, isn't
  approved ("Approve it first."), is already active, done or cancelled; any local `feature/<N>-*` branch exists, or
  any remote-tracking `refs/remotes/*/feature/<N>-*` one ("Check it out instead."); the base branch can't be found (the
  ADR 0023 wording); the base doesn't have the card committed as approved.
- **All or nothing.** The branch is published by the last step, so a failure before it leaves only unreferenced objects
  (and the temporary index is removed). If the branch exists by then, Start refuses and never moves or deletes it.
- **Who can start.** The card pane (Work, and the chat's docked pane) shows Start when `CardView.startable` is set, which
  work-format computes from the same rule the server checks. An approved feature has no story to open it from, so its
  row in Work gets an Open button. `start_feature` is open to any chat with the MCP on and the knowledge setting not
  read-only, like `draft_cards`; it is not tied to the Dev Lead role. Nothing in the flow is provider-specific.

## Consequences

Start needs a committed, approved feature on the base branch. It needs no worktree and no dependencies installed, so
it works in Featra's own repository, whose pre-commit hook runs the full check. It leaves unreferenced objects in git's
store when it fails late, which `git gc` collects. Ownership after Start is visible and testable through the same rules
as any other feature branch.
