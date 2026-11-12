# 0034 — Merging a story into its feature

Date: 2026-11-12 · Status: proposed

## Context

A story is built in its own worktree and branch (ADR 0025), checked locally or in CI (ADR 0031), and has a PR when
GitHub is usable (ADR 0032). Its work then has to reach the feature branch. Accept gates Done, not the merge: a story can
be Verified and merged before the user accepts it. A merge must never lose work, never rewrite history, and never happen
on its own. The card is owned by its worktree while the worktree exists (ADR 0002), so the merge also moves ownership.

## Decision

- **Only the user merges.** Merge is offered in the story's card pane, Work row and session when it is Verified, from
  review on (or Done), with a live worktree, and not merged yet. The Dev Lead can only ask with `request_merge`: an
  approval card in its chat and the Inbox, with Merge and Decline. The call answers once the user is asked. How it ends
  (declined, merged, or not merged and why) reaches the Dev Lead as a notice. A story session can't ask.
- **A merge commit, never squash, rebase or force.** With GitHub usable the story's PR is merged:
  `gh pr merge --merge --match-head-commit <tip>`, so GitHub merges only the head Featra checked. A story with no PR is
  refused. In local mode Featra makes the merge commit itself with `git merge-tree --write-tree` and `commit-tree`
  (parents: the feature branch, then the story branch), with the merged card in it. It then moves the feature branch by a
  fast-forward where it is checked out, or by `update-ref` with the old value where it isn't. No checkout is touched
  mid-merge.
- **Verified for the current head.** On GitHub the PR's head must be the story branch's tip. With local checks, the
  commit the checks last settled on must be the tip too. Checks still running, or settled on an older commit, refuse.
  With checks on CI, Merge reads the PR's checks again for that head, and they must pass: the PR poller's last read
  may be for an older commit.
- **The checked commit is on the card.** Each time the checks settle on a new commit, the card's evidence records
  `checked:<commit>` by `system` (ADR 0004's history, next to `verified`). The checks' own memory comes first; after a
  restart, the card's commit stands in for it. Merge works when the tip is that commit and refuses otherwise. A commit
  Featra only saw on start is never taken as checked.
- **Nothing is lost.** The story's worktree must have no uncommitted changes except its own card, and its session must
  not be running or queued. Both refuse with one sentence naming the problem. While a story merges, a message to its
  session and Resume are refused, so no turn starts mid-merge. Once the session has ended, the worktree is checked
  again: with anything uncommitted besides the card, the worktree and its branch stay and the user is told. This also
  covers a PR merged on GitHub outside Featra, where nothing was checked before. `git worktree remove --force` only
  ever discards the card, which the feature branch has.
- **git 2.38 or later.** An older git, whose `merge-tree` has no `--write-tree`, refuses with one sentence.
- **A conflict merges nothing.** The story goes back to the first active stage by `system`, and a Stopped mark is
  cleared. Its session is sent the conflicting files first and the card is recorded after (send-then-record, as Send
  back does). On GitHub the files come from `merge-tree` of the fetched feature branch.
- **After the merge.**
  - The story's session ends for good, and its chat stays as its transcript.
  - The card records `merged` (from the story branch to the feature branch) by `system`, and its status is unchanged.
  - From then on the feature branch's copy owns the card. In local mode it is in the merge commit. After a GitHub merge
    it is a commit on the local feature branch, on top of GitHub's merge, and it is not pushed.
  - The worktree, the local branch and the remote branch are removed. The remote branch goes with
    `git push --delete`, not `gh --delete-branch`, which also changes local checkouts. In local mode it is deleted from
    each remote that has it; one that can't be reached is listed.
  - Anything that can't be removed is listed in one line, and so is how far the local feature branch is ahead of
    GitHub after a GitHub merge.
  - If the feature branch can't take the card commit, nothing changes: the worktree's card isn't written as merged, so
    merging again (or the PR poller) settles it once the user has pulled.
  - A GitHub refusal that isn't a conflict (branch protection, say) is an error, and the story stays where it is. A
    conflict whose files Featra can't find is an error too.
- **Outside merges count.** The PR poller keeps reading a story's PR while it has a worktree and isn't merged, Done
  stories included. A PR merged on GitHub outside Featra settles exactly as a merge Featra made.

## Consequences

- A merge leaves a real merge commit on the feature branch either way, so the story's history stays intact and
  reviewable.
- The local feature branch is one commit ahead of GitHub after a GitHub merge, until the user pushes it.
- A merged story's card is read-only in Featra unless its feature branch is checked out (ADR 0017).
