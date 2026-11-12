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
- **Nothing is lost.** The story's worktree must have no uncommitted changes except its own card, and its session must
  not be running or queued. Both refuse with one sentence naming the problem.
- **A conflict merges nothing.** The story goes back to the first active stage by `system`, and a Stopped mark is
  cleared. Its session is sent the conflicting files first and the card is recorded after (send-then-record, as Send
  back does). On GitHub the files come from `merge-tree` of the fetched feature branch.
- **After the merge.**
  - The story's session ends for good, and its chat stays as its transcript.
  - The card records `merged` (from the story branch to the feature branch) by `system`, and its status is unchanged.
  - From then on the feature branch's copy owns the card. In local mode it is in the merge commit. After a GitHub merge
    it is a commit on the local feature branch, on top of GitHub's merge, and it is not pushed.
  - The worktree, the local branch and the remote branch are removed. The remote branch goes with
    `git push --delete`, not `gh --delete-branch`, which also changes local checkouts.
  - Anything that can't be removed is listed in one line. If the feature branch can't take the card commit, nothing is
    removed, so the card that says it merged stays in the worktree.
- **Outside merges count.** The PR poller keeps reading a story's PR while it has a worktree and isn't merged, Done
  stories included. A PR merged on GitHub outside Featra settles exactly as a merge Featra made.

## Consequences

- A merge leaves a real merge commit on the feature branch either way, so the story's history stays intact and
  reviewable.
- The local feature branch is one commit ahead of GitHub after a GitHub merge, until the user pushes it.
- After a restart, local mode doesn't know which commit the checks settled on until they run again. Merge refuses as
  stale until then.
- A merged story's card is read-only in Featra unless its feature branch is checked out (ADR 0017).
