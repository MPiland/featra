# 0034 — Merging a story into its feature

Date: 2026-11-12 · Status: proposed

## Context

A story is built in its own worktree and branch (ADR 0025), checked locally or in CI (ADR 0031), and has a PR when
GitHub is usable (ADR 0032). Its work then has to reach the feature branch. Accept gates Done, not the merge: a story can
be Verified and merged before the user accepts it. A merge must never lose work, never rewrite history, and never happen
on its own unless auto-merge is on. The card is owned by its worktree while the worktree exists (ADR 0002), so the merge also moves ownership.

## Decision

- **The user merges, or auto-merge when it's on.** (Amended 2026-11-16, STORY-59.) With the Workflow setting
  `autoMerge` on (the project's own value, else the app default, else on), a story that is Verified, with every
  criterion proven at the commit Merge would merge (`proven:<n>@<commit>`; proof recorded without a commit doesn't
  count), under an active feature (not Cancelled, Done or merged to main), whose owner copy can be read and that Merge
  would take, merges on its own through the same merge, by `system`, without Accept. Each project's stories are looked
  at when it opens, whenever a scan changes which could merge, when a chat changes, and when the app's settings are
  saved. A story whose session is running or waiting is passed over until it is idle. Stories of one feature merge one
  at a time. A story is tried once for each head, checked commit and feature tip. The Dev Lead that started the story is told it
  merged. With the setting off, nothing merges on its own. Merge by hand is unchanged.
- **An automatic merge that fails.** (Amended 2026-11-16, STORY-60 and its review.) It fails the way Merge does: on a
  conflict nothing merges, the story goes back to its first active stage and its session gets the files. A merge's
  error carries a kind (`StoryRefusal`), never matched by its copy. Only a refusal that is the story's own at its
  commit counts: a conflict (or one GitHub can't name the files of), work left uncommitted, no PR, a closed PR, or
  GitHub refusing the merge. That is told to the Dev Lead as a `not merged` notice with the reason, and recorded on
  the card as a `not-merged` history event by `system` (from: the commit tried, and for a conflict `@` the feature
  branch's tip; to: the reason). It stands until the checks settle on another commit (a new `checked:`) or the story
  merges, and a conflict only while the feature branch's tip also stays where it was; a move between stages doesn't
  clear it. While it stands the card pane and the story's session show it, and the story isn't tried again there,
  after a restart too. Nothing is recorded when the story's commit is unknown or the write fails: it is then tried
  again after a restart. Any other refusal (a race with its session or a Merge by hand, a story moved or merged
  meanwhile, GitHub or CI that can't be read, the feature branch moving) is logged; nothing is told or recorded, and
  the story is looked at again. An error that isn't a refusal is a bug, and is only logged.
- **Merge, by hand.** Merge is offered in the story's card pane, Work row and session when it is Verified, from
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
  Featra only saw on start is never taken as checked. A verdict with no known commit records a bare `checked:`, so
  an older commit never stands beside a newer verdict. The stored commit has the same trust as `verified`: both are
  card history written by `system`, and Merge takes the card's word for them.
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
    each remote that has it, only when the feature branch has its tip, and with `--force-with-lease` at that tip. One
    with commits the feature doesn't have stays and is listed, and so is one that can't be reached.
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
