---
id: STORY-11
type: story
title: Story PR and PR chip
status: Acceptance
parent: FEAT-6
order: 2
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-04T23:00:00Z
history:
  - at: 2026-11-04T23:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-12T19:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-11
  - at: 2026-11-12T23:00:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-11
  - at: 2026-11-12T19:34:20Z
    field: status
    from: In Review
    to: Acceptance
    by: dev-lead
---

## Description

As a builder on GitHub, each story's PR is opened for me and its state and checks show on the card.

## Acceptance criteria

- [x] Featra detects per project whether GitHub is usable (a GitHub remote and a signed-in `gh`); when it is not, the project is in local mode and project settings say in one line what is missing (test: packages/server/test/story-prs-open.test.ts::is usable with a GitHub remote and a signed-in gh; packages/server/test/story-prs-open.test.ts::says in one line what is missing: the remote, gh, or its sign-in; packages/server/test/story-prs-open.test.ts::shows the missing line in Project settings and does nothing in local mode; packages/work-format/test/prs.test.ts::needs a GitHub remote, gh, and gh signed in, and says the first that is missing; packages/server/test/story-prs-api.test.ts::say GitHub is usable and change the PR settings in the project's config; packages/client/test/components/settings/ProjectPrs.test.tsx::says in one line what is missing, and nothing when GitHub is usable)
- [x] With the project setting "Open story PRs automatically" on (the default), a story moving to In Review has its branch pushed and a PR opened against the feature branch through the user's `gh`; with it off, the card shows Create PR (test: packages/server/test/story-prs-open.test.ts::pushes its branch and opens its PR against the feature branch, recorded by system; packages/server/test/story-prs-open.test.ts::adopts the open PR from the story's branch instead of opening another; packages/server/test/story-prs-open.test.ts::with the setting off pushes nothing and offers Create PR, which opens it; packages/server/test/story-prs-open.test.ts::refuses Create PR outside review and when the story has a PR; packages/server/test/story-prs-open.test.ts::shows why it couldn't open the PR on the card and offers Create PR again; packages/server/test/story-prs-api.test.ts::offers Create PR on card.watch, opens the PR, and the card and Work row carry its state; packages/client/test/components/settings/ProjectPrs.test.tsx::is on by default and the user turns it off; packages/client/test/components/story-pr.test.tsx::is offered when the server says so, and asks the server to open the PR; packages/client/test/components/story-pr.test.tsx::isn't offered while the PR opens, or once the story has one; apps/desktop/e2e/story-pr.spec.ts::A story moving to review opens its PR, the chip shows it, and CI checks verify the story; packages/server/test/story-prs-open.test.ts::doesn't adopt a fork's branch of the same name, or a PR into another branch; packages/server/test/story-prs-open.test.ts::pushes to the remote GitHub is on, whatever its name; packages/server/test/story-prs-open.test.ts::keeps the pr someone set on the card while the PR opened; packages/server/test/gh-run.test.ts::hands gh each argument whole, commas, braces and spaces included; packages/server/test/gh-run.test.ts::quotes commas and equals signs, which cmd.exe splits arguments on; packages/server/test/gh-run.test.ts::refuses a part with a character cmd.exe reads even inside quotes)
- [x] The card and the Work row show a PR chip labelled with the PR number (`#14`), never the raw URL, linking to the PR, with its state and checks; the full URL shows on hover (test: packages/server/test/story-prs-read.test.ts::reach the card and the story's Work row once read; packages/server/test/story-prs-read.test.ts::follow a draft, a merge and a close; packages/work-format/test/prs.test.ts::is the PR number, never the URL; packages/client/test/components/story-pr.test.tsx::on the card is the PR number linking to the PR, with its state, its checks and the URL on hover; packages/client/test/components/story-pr.test.tsx::on the story's Work row is the PR number, its state, and its checks as a mark that says itself; apps/desktop/e2e/story-pr.spec.ts::A story moving to review opens its PR, the chip shows it, and CI checks verify the story; packages/client/test/components/story-pr.test.tsx::shows #N as text with no link, on the Work row and the card; packages/work-format/test/prs.test.ts::is the number of a pr recorded as the number alone, as older cards have it; packages/work-format/test/prs.test.ts::hands the OS browser only an https link)
- [x] Featra re-reads open PRs every N minutes (a project setting, default 2) and when the window regains focus, using no tokens (test: packages/server/test/story-prs-read.test.ts::reads at start, then every N minutes from the project's setting; packages/server/test/story-prs-read.test.ts::waits the new interval once the user changes it; packages/server/test/story-prs-read.test.ts::reads soon after the window regains focus, once for a burst of focus changes; packages/server/test/story-prs-read.test.ts::never runs two reads of a project at once; packages/server/test/story-prs-api.test.ts::re-reads open PRs on prs.refresh, after the focus settles; packages/client/test/components/story-pr.test.tsx::asks the server for a read each time the window is focused; packages/client/test/components/settings/ProjectPrs.test.tsx::shows 2 minutes by default and saves a new interval; packages/server/test/story-prs-read.test.ts::forgets what it read of a project once the project closes)
- [x] When the project's checks run on CI, passing required checks mark the story Verified, and a failing check removes Verified (test: packages/server/test/story-prs-read.test.ts::passing checks mark the story Verified and a failing check removes it, by system; packages/server/test/story-prs-read.test.ts::records nothing when the project's checks run on this computer; packages/work-format/test/prs.test.ts::is CI evidence only once checks finish: passing verifies, failing unverifies, else nothing; apps/desktop/e2e/story-pr.spec.ts::A story moving to review opens its PR, the chip shows it, and CI checks verify the story; packages/server/test/story-prs-read.test.ts::never keeps Verified for a commit the PR doesn't have yet: a new commit needs its own passing checks; packages/server/test/story-prs-read.test.ts::counts the repo's required checks: an optional check failing doesn't stop Verified, a required one does; packages/server/test/story-prs-read.test.ts::counts every reported check when the repo requires none; packages/server/test/story-prs-read.test.ts::records nothing from a read that finishes after its project closed; packages/work-format/test/prs.test.ts::never verifies checks for a commit the story's branch has moved past; packages/work-format/test/prs.test.ts::unverifies a moved head until its own checks pass; packages/work-format/test/prs.test.ts::passes when every check passed or was skipped, and is none without checks; packages/work-format/test/prs.test.ts::fails on a failed or cancelled check, even with others running)

## Tasks

- [x] Rules in work-format: PR settings in config (`openStoryPrs`, `prRefreshMinutes`), PR status from `gh` JSON (state, checks verdict), PR number from URL, `pr` history event, local-mode copy
- [x] Server: `gh` runner shared with GitHub detection; GitHub usable (remote and signed-in `gh`) with what is missing
- [x] Server: open a story PR on the move into review (push, adopt or create, record `pr` by system); Create PR action
- [x] Server: one PR poller per project (interval from settings, focus refresh debounced, no overlap, stops on close); CI Verified and unverified through the same evidence path, only when checks run in CI
- [x] Protocol, API, Work row and card view carry PR state; Project settings' Pull requests section
- [x] Client: PR chip on card and Work row, Create PR, window-focus refresh
- [x] Unit, integration and component tests for each criterion; Playwright journey; tests linked on the criteria
- [x] Decisions recorded for the Dev Lead; ADR; move to In Review

## Notes

## Depends on

- STORY-56 Local checks and where checks run
