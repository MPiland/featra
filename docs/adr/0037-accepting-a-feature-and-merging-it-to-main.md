# 0037 — Accepting a feature and merging it to main

Date: 2026-11-12 · Status: proposed

## Context

A feature is built on its own branch (`feature/<n>-<slug>`, ADR 0024), its stories merge into that branch with
merge commits (ADR 0034), and the branch owns the feature's cards until main has them (ADR 0002). The work then has to
reach main. That is the user's call, made twice: Accept says the feature is what they wanted, and Merge to main says
it can go now. A merge to main must never lose work, never rewrite history, and never happen on its own. Main may move
on while the feature waits, and only an agent working on the feature branch should fix that.

## Decision

- **Accept is the user's, once the feature is finished.** A feature in progress offers Accept once every story and bug
  under it is Done or Cancelled and at least one is Done. Accept records `accepted` in the card's history (as a story's
  Accept does) on the feature branch, by `user`. The feature's Work row then offers Open, which opens its card, where
  Accept and Merge to main are; an active feature that isn't finished has no Open. Accept never sets Done.
- **The feature's PR opens on Accept.** With GitHub usable and the project setting `openFeaturePrs` on (the default),
  Accept pushes the feature branch and opens (or adopts) its PR to main first, then records Accept and the PR in one
  card write. With the setting off, the card offers Create PR. Local mode has no PR. A feature card writes `pr` to its
  frontmatter only once it has one, so other features' files are unchanged.
- **What Merge to main waits on is read fresh.** For each accepted feature the server reads, on the PR interval, on
  window focus, and when the feature branch or main moves: whether main's tip (GitHub's copy when GitHub is usable) is
  in the feature branch's history, whether merging conflicts (`git merge-tree --write-tree`), its PR (none, open or
  closed), whether GitHub's copy of the branch has commits this computer doesn't, and its checks at the commit the
  branch is at. Checks are CI on the PR, or the check command run here in a temporary detached worktree at that commit,
  whose verdict is kept in memory per commit. Merge to main is on only when nothing stops it; otherwise the reason
  shows beside it, in that order of precedence: conflicts, behind main, no PR, PR closed, branch ahead on GitHub, then
  the checks. A feature branch that GitHub's copy is behind on is pushed, never forced.
- **Main moving on goes to the Dev Lead.** When main isn't in the feature branch's history, the Dev Lead leading the
  feature is sent a notice (outcome `behind main`) to merge main into the feature branch with a merge commit, never a
  rebase, naming any conflicting files. It is sent once per main commit. The Dev Lead is the chat that drafted the
  feature, else the Dev Lead that started a story under it. Featra itself never merges main in and never rebases. Merge
  to main then waits for passing checks on the new tip.
- **A merge commit, never squash, rebase or force.** With GitHub usable the feature's PR is merged:
  `gh pr merge --merge --match-head-commit <tip>`, after reading the PR again (merged already, closed, a head that isn't
  the tip, or conflicting each refuse or settle). In local mode Featra makes the merge commit itself with `merge-tree`
  and `commit-tree` (parents: main, then the feature branch), with the Done card in it, and publishes main only when its
  checkout is clean; otherwise it refuses with one sentence and main is untouched.
- **Done only by the merge.** The feature becomes Done by `system`, with `merged` (feature branch to main) and its PR in
  its history. After a GitHub merge the Done card is a commit on local main on top of GitHub's merge commit, and how far
  local main is ahead of GitHub is said. A PR merged on GitHub outside Featra is noticed by the same reads and settles
  the same way.
- **Main owns the feature's cards.** Once main has the feature branch's tip and the branch isn't checked out, ownership
  resolves to main for the feature and all its cards; nothing is copied. A checkout of the feature branch keeps its
  cards there until it is switched away, and the merge says so. Feature branches are kept.

## Consequences

- The feature's end needs no new state on disk besides `accepted`, `merged` and `pr` in the card's history and
  frontmatter. Check verdicts are in memory, so a restart runs local checks again.
- Every read of an accepted feature may fetch from GitHub and push its branch. Reads are limited to accepted features
  and share the PR interval.
- A notice to the Dev Lead is dropped when no Dev Lead can be found for the feature (one drafted before STORY-8 with
  no story sessions); Merge to main still says why it waits.
- A notice's summary is cut at 160 characters, so a long list of conflicting files is cut too; the Dev Lead finds the
  full list when it merges.
