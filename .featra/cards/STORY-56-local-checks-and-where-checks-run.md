---
id: STORY-56
type: story
title: Local checks and where checks run
status: In Review
parent: FEAT-6
order: 3
origin: planned
role: developer
agent: claude
model: null
reasoning: null
sessions: []
branch: null
pr: null
created: 2026-11-11T20:00:00Z
history:
  - at: 2026-11-11T20:00:00Z
    field: status
    from: null
    to: New
    by: user
  - at: 2026-11-12T17:00:00Z
    field: status
    from: New
    to: In Progress
    by: session:story-56
  - at: 2026-11-12T17:30:00Z
    field: status
    from: In Progress
    to: In Review
    by: session:story-56
---

## Description

As a builder without CI, or with limited CI minutes, Featra runs my project's checks on this computer, so stories can still be Verified and Proven.

## Acceptance criteria

- [x] A project setting chooses where checks run: CI or this computer; it defaults to CI when the repo is public on GitHub and has workflows, otherwise this computer (test: packages/server/test/check-settings.test.ts::defaults to CI for a public GitHub repo with workflows, and says why; packages/server/test/check-settings.test.ts::defaults to this computer for a private repo; packages/server/test/check-settings.test.ts::keeps the user's choice, in the project's config, over the default; packages/client/test/components/settings/ProjectChecks.test.tsx::shows the default and why, and saves the user's choice)
- [x] Featra proposes a check command from the project's files (for example the `test` script in `package.json`), or the Dev Lead proposes one; the user confirms or edits it in project settings (test: packages/server/test/check-settings.test.ts::proposes the test script of package.json through the lockfile's package manager; packages/server/test/check-settings.test.ts::applies nothing until the user confirms, and a confirmed value is no longer proposed; packages/server/test/story-checks-api.test.ts::puts it in Project settings and applies nothing until the user confirms it; packages/mcp/test/propose-check-command.test.ts::puts the proposal in Project settings and applies nothing; packages/client/test/components/settings/ProjectChecks.test.tsx::shows each proposal and its source, fills the field on Use this, and applies nothing until Save; apps/desktop/e2e/local-checks.spec.ts::Confirm a check command, move a story to review: it fails with its output, then Re-run passes and Verifies it)
- [x] When checks run on this computer, Featra runs the check command in the story's worktree when the story moves to In Review and when new commits land there; the card has Re-run (test: packages/server/test/story-checks.test.ts::runs the check command in its worktree and marks it Verified by system; packages/server/test/story-checks.test.ts::runs again when a commit lands in the worktree; packages/server/test/story-checks-api.test.ts::runs the check command, then the card pane hears the failing output, and Re-run runs it again; packages/client/test/components/story-checks.test.tsx::has Re-run, which asks the server to run the checks again; apps/desktop/e2e/local-checks.spec.ts::Confirm a check command, move a story to review: it fails with its output, then Re-run passes and Verifies it)
- [x] A passing run marks the story Verified; a failing run removes Verified and the card shows the failing output (test: packages/server/test/story-checks.test.ts::runs the check command in its worktree and marks it Verified by system; packages/server/test/story-checks.test.ts::removes Verified when the run fails, and the card shows the failing output; packages/client/test/components/story-checks.test.tsx::shows the failing output, the command and the failed criterion after a failing run; apps/desktop/e2e/local-checks.spec.ts::Confirm a check command, move a story to review: it fails with its output, then Re-run passes and Verifies it)
- [x] Each acceptance criterion's linked test is run too; a passing linked test marks that criterion Proven (test: packages/server/test/story-checks.test.ts::marks a criterion Proven when its test passes and shows one that fails; packages/server/test/story-checks.test.ts::removes Proven when the test starts failing; packages/server/test/story-checks.test.ts::runs linked tests even when the check command fails, and an AC with two tests needs both)

## Tasks

- [x] Rules in work-format: where checks run (default), check settings in config, check and linked-test command proposals, linked-test refs, safe argument quoting, evidence from a run (Verified, Proven), when checks apply to a story
- [x] Server: GitHub detection (one small module STORY-11 reuses), project config writer, proposals store
- [x] Server: check runner (bounded tail, one run per worktree, queue behind a running one), story checks service (In Review, new commits, Re-run, writes by system)
- [x] Protocol, API and agent method; MCP tool `propose_check_command`
- [x] Client: Checks section in project settings; card pane Checks line, failing output and Re-run
- [x] Unit, integration and component tests for each criterion
- [x] Playwright journey test; tests linked on the criteria
- [x] ADR, decisions recorded for the Dev Lead; move to In Review

## Notes
