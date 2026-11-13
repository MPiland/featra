# 0035 — Abandoning a story

Date: 2026-11-12 · Status: proposed

## Context

A story the user no longer wants has to go: its session, its PR, its worktree and its branches. Its card either stays
as a record or goes too. Unlike a merge (ADR 0034), abandoning can lose work: uncommitted files, commits not pushed,
and a PR's discussion. The card is owned by its worktree while that exists (ADR 0002), so ending the worktree also
moves the card. A card that is deleted must not come back from an older copy elsewhere: main and the feature branch
still have the copy the story was planned with.

## Decision

- **Only the user abandons.** Abandon is in the story's card pane only, for a story that isn't merged or done, where
  its owner copy is checked out or its owner is a feature branch (written with plumbing, below). A Cancelled story is offered it only while its worktree is still there. There is no
  MCP tool for it. Bugs and features can't be abandoned this way.
- **Warn, then confirm what was warned.** `story.abandonCheck` reads the story and returns the warning: uncommitted
  files in its worktree, commits lost with the branch (those not on the feature branch and on no remote branch but the
  story's own, which is deleted too), the open PR it closes, the branch and the
  remotes it is deleted from. The question names each risk under "This can't be undone:", and offers Keep as Cancelled
  or Discard card. `story.abandon` carries the warning's token, a digest of what it showed. The story is read again
  after its turn stops and in the card lane, and any change refuses with nothing done. The token covers which files are
  uncommitted, not later edits to a file already listed: those are lost too, as the warning said of that file.
- **One ending at a time.** Merge and Abandon share one gate per story. While either runs, the session takes no
  message, Send back or Resume, and the other ending is refused.
- **In order.** Stop the story's turn; read it again and compare tokens; close its open PR with `gh pr close <url>`;
  then, in the card lane, read it again, retire its session (the chat stays as its transcript) and write the card; then
  remove the worktree and the branches. A PR that can't be closed, or a change found by either read, stops everything
  with the session still there. Anything that can't be removed
  afterwards is listed in one line, and the card already says it was abandoned.
- **The card.** Kept, it is Cancelled, logged in its history by `user`, and left out of every count (the rollup
  already leaves Cancelled out). Discarded, its file is deleted at its owner and its index row goes with the next scan. For a
  story in its own worktree, the change is committed on the feature branch with plumbing (`STORY-N: abandoned, kept as
  Cancelled` or `… card discarded`), which owns the card from then on; its local branch only, not pushed. A story the
  feature branch owns, checked out or not, is changed the same way. When the branch has the card so already (an abandon
  tried again after the worktree stayed), no commit is made. When the feature branch is then ahead of GitHub's copy,
  the result says so, as Merge does (ADR 0034). For a story with no worktree and no feature branch owning it, its owner's copy is edited where it is checked out, uncommitted, like any card edit.
- **Branches.** The local branch is deleted with `update-ref -d` at the tip that was read. A remote branch is deleted
  through the same `deleteRemote` Merge uses: `git push --force-with-lease=<tip> --delete`, only while its tip is the
  one the warning read, where that tip is the local tip or behind it. A remote with
  commits that aren't here keeps its branch, and that is said. The worktree is removed with `--force`, as confirmed.
- **A deleted card stays deleted.** The scanner resolves owners as before (ADR 0002). Then, for a card whose owner has
  no copy of it, it asks git whether the owner deleted it: its HEAD has the file, or the owner branch's history had it.
  If so, the card is left out, with no problem, however many older copies other branches keep. An uncommitted edit to
  one of those copies in a worktree is still reported as a stale copy, so no edit is hidden silently.

## Consequences

- Abandoning can't be undone from Featra, and the warning says what it costs first.
- A discarded card's history stays in git, on main and the feature branch; the story branch's commits go with it.
- The local feature branch is a commit ahead of its remote after abandoning a worktree story, until the user pushes.
- The PR is closed before the session is retired, so a later failure in the card lane leaves a story whose PR is closed
  but whose session is there. The user can reopen the PR or abandon it again.
- Owner resolution reads git history once per orphaned card and per read of git. Cards that resolve normally cost
  nothing more.
