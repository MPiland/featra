# 0032 — Story PRs through the user's `gh`

Date: 2026-11-12 · Status: proposed

## Context

A story's work ends in a pull request against its feature branch. Featra already runs the user's own `git` and, for
GitHub detection, the user's own `gh` (ADR 0031). It holds no GitHub token of its own, and reading a PR's state should
cost no agent tokens. Many projects have no GitHub at all.

## Decision

- **GitHub through the user's `gh`, never a token of Featra's.** A project is GitHub-usable when it has a GitHub remote,
  `gh` runs and `gh auth status --hostname github.com` exits 0. Otherwise it is in local mode: nothing is pushed, opened
  or read, nothing errors, and Project settings say in one line what is missing.
- **Fixed argv, text on stdin.** `gh` gets fixed arguments plus checked values only (a branch name, a GitHub PR URL). A
  new PR's title and body go to `gh api repos/{owner}/{repo}/pulls` as JSON on stdin. On Windows `gh` may be a `.cmd`
  shim, so it runs through the shell with per-argument quoting and refuses `"`, `%`, `^`, `!` and line breaks.
- **Open on the move into review.** With `openStoryPrs` on (the default), a story that moves into review after Featra
  started has its branch pushed (never forced) and its PR opened against its feature branch, or the open PR from its
  branch adopted. With it off, or after a failure, the card offers Create PR. The PR URL is recorded on the owner copy by
  `system` (ADR 0002).
- **Read on an interval and on focus.** One poller per project reads its stories' open PRs (`gh pr view --json`) every
  `prRefreshMinutes` (default 2) and soon after the window regains focus. Reads never overlap and stop when the project
  closes. State and checks are kept in memory and sent with the card and the Work list; they are not written to cards.
- **CI evidence.** When checks run in CI (ADR 0031), the PR's checks are the story's CI result: all passing writes
  Verified, any failing removes it (ADR 0004), through the same evidence path as local checks. Every reported check counts
  as required.
- **The chip shows the number, not the URL.** `#14` links to the PR, opened in the OS browser through the host; only
  https links are opened.

## Consequences

- Featra works fully without GitHub; GitHub adds PRs and CI evidence.
- A check that isn't required on GitHub can still remove Verified. Reading required checks would need a call per check.
- PR state is as fresh as the last read: up to N minutes old unless the window regains focus.
- Providers other than GitHub (GitLab, Bitbucket) would need their own CLI behind the same shape.
