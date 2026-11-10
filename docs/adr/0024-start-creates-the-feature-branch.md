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
- **Main's checkout is never touched.** Start makes a temporary worktree on the new branch
  (`git worktree add -b <branch> <tmp> <base>`), writes the card there, commits, and removes the worktree. HEAD, the
  index and the working tree of the user's checkout are as they were, even when it is on another branch.
- **What it commits** is the feature as the base branch has it, changed from `approved` to `active` with a status event
  (`by: user` from the window, `by: session:<chat id>` from the MCP; the chat comes from the agent's secret, ADR 0019),
  as `FEAT-N: started <title>`. Only that one file. The repo's hooks run; never `--no-verify`; never pushed.
- **Ownership moves by the existing rules.** The branch is one commit ahead of base, so `branchStateOf` reads it as
  active, `ownerOf` makes it the owner of the feature and its stories, and `resolveCopies` shows only the owner's copy.
  Main's copies stay on disk and are no longer shown. There is no UI special case.
- **Refusals**, each one sentence and naming what to do, and nothing changed: the feature isn't a feature, isn't
  approved ("Approve it first."), is already active, done or cancelled; any `feature/<N>-*` branch already exists; the
  base branch can't be found (the ADR 0023 wording); the base doesn't have the card committed as approved.
- **All or nothing.** If a hook, the write or git fails, the worktree is removed and the new branch deleted, and the
  message says nothing was changed. If cleaning up fails too, it says so instead.
- **Who can start.** The card pane (Work, and the chat's docked pane) shows Start when `CardView.startable` is set, which
  work-format computes from the same rule the server checks. An approved feature has no story to open it from, so its
  row in Work gets an Open button. `start_feature` is open to any chat with the MCP on and the knowledge setting not
  read-only, like `draft_cards`; it is not tied to the Dev Lead role. Nothing in the flow is provider-specific.

## Consequences

Start needs a committed, approved feature on the base branch, and git able to make a worktree. A repo whose pre-commit
hook needs the project's installed dependencies (Featra's own runs the full check) will refuse Start from a fresh
temporary worktree, with the hook's message; the user can make the branch and commit by hand. Whether the first commit
should skip hooks is left to the Dev Lead. Ownership after Start is visible and testable through the same rules as any
other feature branch.
